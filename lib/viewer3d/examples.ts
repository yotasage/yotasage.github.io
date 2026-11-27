export type Viewer3dExampleId =
  | 'bracket-stl'
  | 'heatsink-stl'
  | 'enclosure-obj'
  | 'spur-gear-stl'
  | 'terrain-ply'
  | 'shaft-pair-stl';

export interface Viewer3dExamplePreset {
  id: Viewer3dExampleId;
  code: string;
}

export const VIEWER3D_EXAMPLE_PRESETS: readonly Viewer3dExamplePreset[] = [
  { id: 'bracket-stl', code: '.stl · Mechanical' },
  { id: 'heatsink-stl', code: '.stl · Thermal' },
  { id: 'enclosure-obj', code: '.obj + .mtl' },
  { id: 'spur-gear-stl', code: '.stl · 24T Gear' },
  { id: 'terrain-ply', code: '.ply · Vertex RGB' },
  { id: 'shaft-pair-stl', code: '2 × .stl' },
];

type Vec3 = [number, number, number];
type Tri = [Vec3, Vec3, Vec3];

function pushBoxTris(
  out: Tri[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): void {
  const v000: Vec3 = [x0, y0, z0];
  const v100: Vec3 = [x1, y0, z0];
  const v110: Vec3 = [x1, y1, z0];
  const v010: Vec3 = [x0, y1, z0];
  const v001: Vec3 = [x0, y0, z1];
  const v101: Vec3 = [x1, y0, z1];
  const v111: Vec3 = [x1, y1, z1];
  const v011: Vec3 = [x0, y1, z1];

  // -Z (bottom)
  out.push([v000, v010, v110], [v000, v110, v100]);
  // +Z (top)
  out.push([v001, v101, v111], [v001, v111, v011]);
  // -Y (front)
  out.push([v000, v100, v101], [v000, v101, v001]);
  // +Y (back)
  out.push([v010, v011, v111], [v010, v111, v110]);
  // -X (left)
  out.push([v000, v001, v011], [v000, v011, v010]);
  // +X (right)
  out.push([v100, v110, v111], [v100, v111, v101]);
}

function pushCylinderTris(
  out: Tri[],
  cx: number,
  cy: number,
  z0: number,
  z1: number,
  radius: number,
  segments: number,
): void {
  const cBot: Vec3 = [cx, cy, z0];
  const cTop: Vec3 = [cx, cy, z1];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0b: Vec3 = [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0), z0];
    const p1b: Vec3 = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), z0];
    const p0t: Vec3 = [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0), z1];
    const p1t: Vec3 = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1), z1];
    // Side
    out.push([p0b, p1b, p1t], [p0b, p1t, p0t]);
    // Top cap
    out.push([cTop, p0t, p1t]);
    // Bottom cap
    out.push([cBot, p1b, p0b]);
  }
}

function pushRingExtrusionTris(
  out: Tri[],
  outerRing: [number, number][],
  innerRing: [number, number][],
  z0: number,
  z1: number,
): void {
  const n = outerRing.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ox0, oy0] = outerRing[i];
    const [ox1, oy1] = outerRing[j];
    const [ix0, iy0] = innerRing[i];
    const [ix1, iy1] = innerRing[j];

    // Outer wall
    out.push(
      [[ox0, oy0, z0], [ox1, oy1, z0], [ox1, oy1, z1]],
      [[ox0, oy0, z0], [ox1, oy1, z1], [ox0, oy0, z1]],
    );
    // Inner wall (inward normal)
    out.push(
      [[ix0, iy0, z0], [ix1, iy1, z1], [ix1, iy1, z0]],
      [[ix0, iy0, z0], [ix0, iy0, z1], [ix1, iy1, z1]],
    );
    // Top annular face
    out.push(
      [[ix0, iy0, z1], [ox0, oy0, z1], [ox1, oy1, z1]],
      [[ix0, iy0, z1], [ox1, oy1, z1], [ix1, iy1, z1]],
    );
    // Bottom annular face
    out.push(
      [[ix0, iy0, z0], [ox1, oy1, z0], [ox0, oy0, z0]],
      [[ix0, iy0, z0], [ix1, iy1, z0], [ox1, oy1, z0]],
    );
  }
}

export function encodeBinaryStl(tris: readonly Tri[], headerText = 'yotasage 3D example'): Uint8Array {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < Math.min(80, headerText.length); i++) {
    bytes[i] = headerText.charCodeAt(i) & 0x7f;
  }
  const view = new DataView(buf);
  view.setUint32(80, tris.length, true);

  let offset = 84;
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, a[0], true);
    view.setFloat32(offset + 16, a[1], true);
    view.setFloat32(offset + 20, a[2], true);
    view.setFloat32(offset + 24, b[0], true);
    view.setFloat32(offset + 28, b[1], true);
    view.setFloat32(offset + 32, b[2], true);
    view.setFloat32(offset + 36, c[0], true);
    view.setFloat32(offset + 40, c[1], true);
    view.setFloat32(offset + 44, c[2], true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return bytes;
}

function buildHeatsinkStl(): Uint8Array {
  const tris: Tri[] = [];
  // Main aluminum baseplate: 60 x 44 x 5 mm
  pushBoxTris(tris, -30, -22, 0, 30, 22, 5);
  // Left & right mounting ears
  pushBoxTris(tris, -36, -14, 0, -30, 14, 4);
  pushBoxTris(tris, 30, -14, 0, 36, 14, 4);
  // 9 vertical extruded cooling fins
  const finCount = 9;
  const finThick = 2.0;
  const span = 54;
  const pitch = (span - finThick) / (finCount - 1);
  for (let i = 0; i < finCount; i++) {
    const x0 = -span / 2 + i * pitch;
    const finH = i === 0 || i === finCount - 1 ? 22 : 19 + (i % 2 === 0 ? 2 : 0);
    pushBoxTris(tris, x0, -21, 5, x0 + finThick, 21, finH);
  }
  return encodeBinaryStl(tris, 'Extruded Aluminum Fin Heatsink (mm)');
}

function buildSpurGearStl(): Uint8Array {
  const tris: Tri[] = [];
  const teeth = 24;
  const ptsPerTooth = 4;
  const totalPts = teeth * ptsPerTooth;
  const rRoot = 22;
  const rTip = 26.5;
  const rBore = 8;

  const outer: [number, number][] = [];
  const inner: [number, number][] = [];

  for (let i = 0; i < teeth; i++) {
    const baseA = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const profile: [number, number][] = [
      [baseA, rRoot],
      [baseA + step * 0.22, rRoot],
      [baseA + step * 0.34, rTip],
      [baseA + step * 0.66, rTip],
    ];
    for (let k = 0; k < ptsPerTooth; k++) {
      const [ang, r] = profile[k];
      outer.push([r * Math.cos(ang), r * Math.sin(ang)]);
      const innerAng = ((i * ptsPerTooth + k) / totalPts) * Math.PI * 2;
      inner.push([rBore * Math.cos(innerAng), rBore * Math.sin(innerAng)]);
    }
  }

  // Main gear body (z = 0..10 mm)
  pushRingExtrusionTris(tris, outer, inner, 0, 10);

  // Raised central hub boss (z = 10..15 mm)
  const hubSegs = 48;
  const hubOuter: [number, number][] = [];
  const hubInner: [number, number][] = [];
  for (let i = 0; i < hubSegs; i++) {
    const a = (i / hubSegs) * Math.PI * 2;
    hubOuter.push([14 * Math.cos(a), 14 * Math.sin(a)]);
    hubInner.push([rBore * Math.cos(a), rBore * Math.sin(a)]);
  }
  pushRingExtrusionTris(tris, hubOuter, hubInner, 10, 15);

  return encodeBinaryStl(tris, '24-Tooth Mechanical Spur Gear (mm)');
}

function buildEnclosureObjAndMtl(): { obj: string; mtl: string } {
  const mtl = [
    '# Yotasage Sensor Enclosure Materials',
    'newmtl Housing_Slate',
    'Kd 0.24 0.29 0.36',
    'Ks 0.18 0.18 0.18',
    'Ns 48',
    '',
    'newmtl PCB_Green',
    'Kd 0.10 0.48 0.24',
    'Ks 0.22 0.22 0.22',
    'Ns 64',
    '',
    'newmtl Cover_Accent',
    'Kd 0.88 0.42 0.16',
    'Ks 0.25 0.25 0.25',
    'Ns 72',
    '',
    'newmtl Brass_Standoff',
    'Kd 0.80 0.66 0.26',
    'Ks 0.45 0.40 0.20',
    'Ns 96',
  ].join('\n');

  const lines: string[] = ['# Multi-Part Sensor Enclosure Assembly (mm)', 'mtllib sensor-enclosure.mtl'];
  let vOffset = 1;

  const appendBox = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ) => {
    const verts: Vec3[] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    for (const [x, y, z] of verts) {
      lines.push(`v ${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
    }
    const i = vOffset;
    const faces = [
      [i, i + 3, i + 2, i + 1],
      [i + 4, i + 5, i + 6, i + 7],
      [i, i + 1, i + 5, i + 4],
      [i + 3, i + 7, i + 6, i + 2],
      [i, i + 4, i + 7, i + 3],
      [i + 1, i + 2, i + 6, i + 5],
    ];
    for (const f of faces) lines.push(`f ${f.join(' ')}`);
    vOffset += 8;
  };

  // Base housing floor + 4 walls
  lines.push('o Base_Housing', 'usemtl Housing_Slate');
  appendBox(-32, -22, 0, 32, 22, 3);
  appendBox(-32, -22, 3, 32, -19, 18);
  appendBox(-32, 19, 3, 32, 22, 18);
  appendBox(-32, -19, 3, -29, 19, 18);
  appendBox(29, -19, 3, 32, 19, 18);

  // Brass standoffs inside corners
  lines.push('o Mounting_Standoffs', 'usemtl Brass_Standoff');
  for (const [sx, sy] of [
    [-24, -14],
    [24, -14],
    [-24, 14],
    [24, 14],
  ]) {
    appendBox(sx - 2, sy - 2, 3, sx + 2, sy + 2, 9);
  }

  // Internal PCB board + MCU chip
  lines.push('o PCB_Module', 'usemtl PCB_Green');
  appendBox(-27, -17, 9, 27, 17, 10.6);

  // Top snap cover (slightly raised for exploded inspection)
  lines.push('o Top_Cover', 'usemtl Cover_Accent');
  appendBox(-32, -22, 21, 32, 22, 24);
  appendBox(-18, -10, 24, 18, 10, 25.5);

  return { obj: lines.join('\n'), mtl };
}

function buildTerrainPly(): string {
  const n = 26;
  const size = 60;
  const verts: { x: number; y: number; z: number; r: number; g: number; b: number }[] = [];
  let minZ = Infinity;
  let maxZ = -Infinity;

  const rawHeights: number[] = [];
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const u = (ix / (n - 1)) * 2 - 1;
      const v = (iy / (n - 1)) * 2 - 1;
      const r2 = u * u + v * v;
      const z =
        16 * Math.exp(-2.4 * r2) +
        6.5 * Math.exp(-5.0 * ((u - 0.45) ** 2 + (v + 0.35) ** 2)) +
        3.2 * Math.sin(u * 4.2) * Math.cos(v * 3.8);
      rawHeights.push(z);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  const span = Math.max(1e-6, maxZ - minZ);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const idx = iy * n + ix;
      const x = (ix / (n - 1) - 0.5) * size;
      const y = (iy / (n - 1) - 0.5) * size;
      const z = rawHeights[idx] - minZ;
      const t = (rawHeights[idx] - minZ) / span;
      // Smooth topographic palette: deep teal -> emerald -> warm ochre -> alpine snow
      let r: number;
      let g: number;
      let b: number;
      if (t < 0.35) {
        const k = t / 0.35;
        r = Math.round(28 + k * 24);
        g = Math.round(78 + k * 90);
        b = Math.round(145 - k * 20);
      } else if (t < 0.72) {
        const k = (t - 0.35) / 0.37;
        r = Math.round(52 + k * 165);
        g = Math.round(168 - k * 28);
        b = Math.round(125 - k * 75);
      } else {
        const k = (t - 0.72) / 0.28;
        r = Math.round(217 + k * 33);
        g = Math.round(140 + k * 108);
        b = Math.round(50 + k * 195);
      }
      verts.push({ x, y, z, r, g, b });
    }
  }

  const faces: [number, number, number][] = [];
  for (let iy = 0; iy < n - 1; iy++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iy * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      faces.push([a, b, d], [a, d, c]);
    }
  }

  const header = [
    'ply',
    'format ascii 1.0',
    'comment Yotasage Topographic Elevation Mesh',
    `element vertex ${verts.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${faces.length}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];

  const body = [
    ...verts.map((v) => `${v.x.toFixed(3)} ${v.y.toFixed(3)} ${v.z.toFixed(3)} ${v.r} ${v.g} ${v.b}`),
    ...faces.map(([a, b, c]) => `3 ${a} ${b} ${c}`),
  ];

  return [...header, ...body].join('\n');
}

function buildShaftPairStls(): { shaft: Uint8Array; collar: Uint8Array } {
  const shaftTris: Tri[] = [];
  // Stepped drive shaft (3 coaxial sections)
  pushCylinderTris(shaftTris, 0, 0, 0, 22, 6, 36);
  pushCylinderTris(shaftTris, 0, 0, 22, 46, 9, 36);
  pushCylinderTris(shaftTris, 0, 0, 46, 68, 6, 36);

  const collarTris: Tri[] = [];
  // Flanged locking collar surrounding middle section
  const segs = 36;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    outer.push([18 * Math.cos(a), 18 * Math.sin(a)]);
    inner.push([9.4 * Math.cos(a), 9.4 * Math.sin(a)]);
  }
  pushRingExtrusionTris(collarTris, outer, inner, 27, 41);

  return {
    shaft: encodeBinaryStl(shaftTris, 'Stepped Drive Shaft (mm)'),
    collar: encodeBinaryStl(collarTris, 'Flanged Locking Collar (mm)'),
  };
}

export function generateProceduralViewer3dFiles(
  id: Exclude<Viewer3dExampleId, 'bracket-stl'>,
): { name: string; data: Uint8Array | string; type: string }[] {
  if (id === 'heatsink-stl') {
    return [{ name: 'fin-heatsink.stl', data: buildHeatsinkStl(), type: 'model/stl' }];
  }
  if (id === 'enclosure-obj') {
    const { obj, mtl } = buildEnclosureObjAndMtl();
    return [
      { name: 'sensor-enclosure.obj', data: obj, type: 'text/plain' },
      { name: 'sensor-enclosure.mtl', data: mtl, type: 'text/plain' },
    ];
  }
  if (id === 'spur-gear-stl') {
    return [{ name: 'spur-gear-24t.stl', data: buildSpurGearStl(), type: 'model/stl' }];
  }
  if (id === 'terrain-ply') {
    return [{ name: 'topographic-surface.ply', data: buildTerrainPly(), type: 'text/plain' }];
  }
  const { shaft, collar } = buildShaftPairStls();
  return [
    { name: 'drive-shaft.stl', data: shaft, type: 'model/stl' },
    { name: 'collar-flange.stl', data: collar, type: 'model/stl' },
  ];
}

export async function loadViewer3dExampleFiles(id: Viewer3dExampleId): Promise<File[]> {
  if (id === 'bracket-stl') {
    const res = await fetch('/samples/example-part.stl');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return [new File([buf], 'example-part.stl', { type: 'model/stl' })];
  }
  const generated = generateProceduralViewer3dFiles(id);
  return generated.map(({ name, data, type }) => new File([data as BlobPart], name, { type }));
}
