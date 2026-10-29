// Reads Object File Format (OFF) meshes, which three.js has no loader for: a header (OFF, COFF, NOFF, CNOFF), the
// vertex, face and edge counts, one vertex per line (with a colour in COFF) and one polygon per line, optionally
// followed by a face colour. Colours can be 0 to 1 or 0 to 255. Binary OFF is not supported.
import { BufferGeometry, Float32BufferAttribute } from 'three';

function colorValues(values: number[]): [number, number, number] | null {
  if (values.length < 3) return null;
  const [r, g, b] = values;
  const scale = r > 1 || g > 1 || b > 1 ? 1 / 255 : 1;
  return [r * scale, g * scale, b * scale];
}

export function parseOff(text: string): BufferGeometry {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  if (!lines.length) throw new Error('The OFF file is empty.');
  const header = /^(ST)?(C)?(N)?(4)?(n)?OFF\b\s*(.*)$/.exec(lines[0]);
  if (!header) throw new Error('The file does not start with an OFF header.');
  if (/BINARY/i.test(header[6])) throw new Error('Binary OFF files are not supported.');
  const hasVertexColor = Boolean(header[2]);
  const hasNormal = Boolean(header[3]);
  const hasTexture = Boolean(header[1]);
  let row = 1;
  const countLine = header[6] ? header[6] : lines[row++];
  const [nv, nf] = (countLine ?? '').split(/\s+/).map(Number);
  if (!Number.isInteger(nv) || !Number.isInteger(nf)) throw new Error('The OFF file has no vertex and face counts.');

  const positions = new Float32Array(nv * 3);
  const vertexColors = hasVertexColor ? new Float32Array(nv * 3) : null;
  for (let i = 0; i < nv; i += 1) {
    const v = (lines[row++] ?? '').split(/\s+/).map(Number);
    if (v.length < 3 || v.slice(0, 3).some((n) => !Number.isFinite(n))) throw new Error(`Vertex ${i + 1} of the OFF file is not valid.`);
    positions.set(v.slice(0, 3), i * 3);
    if (vertexColors) {
      const c = colorValues(v.slice(3 + (hasNormal ? 3 : 0) + (hasTexture ? 2 : 0)));
      if (c) vertexColors.set(c, i * 3);
    }
  }

  const triangles: number[] = [];
  const triangleColors: ([number, number, number] | null)[] = [];
  for (let i = 0; i < nf; i += 1) {
    const f = (lines[row++] ?? '').split(/\s+/).map(Number);
    const n = f[0];
    if (!Number.isInteger(n) || f.length < n + 1) throw new Error(`Face ${i + 1} of the OFF file is not valid.`);
    const color = colorValues(f.slice(n + 1));
    // Polygons are split into a fan of triangles.
    for (let k = 1; k < n - 1; k += 1) {
      triangles.push(f[1], f[1 + k], f[2 + k]);
      triangleColors.push(color);
    }
  }
  if (triangles.some((v) => v < 0 || v >= nv)) throw new Error('A face of the OFF file refers to a vertex that does not exist.');

  const geometry = new BufferGeometry();
  if (triangleColors.some(Boolean)) {
    // Face colours: every triangle gets its own vertices, so each can have its own colour.
    const pos = new Float32Array(triangles.length * 3);
    const col = new Float32Array(triangles.length * 3);
    triangles.forEach((v, i) => {
      pos.set(positions.subarray(v * 3, v * 3 + 3), i * 3);
      col.set(triangleColors[Math.floor(i / 3)] ?? [0.8, 0.8, 0.8], i * 3);
    });
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  } else {
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    if (vertexColors) geometry.setAttribute('color', new Float32BufferAttribute(vertexColors, 3));
    geometry.setIndex(triangles);
  }
  geometry.computeVertexNormals();
  return geometry;
}
