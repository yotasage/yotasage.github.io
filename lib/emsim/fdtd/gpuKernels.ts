// The full-wave engine's WGSL kernels (step M6.3, docs/em-sim/fullwave.md §8, §9.1–§9.3), as strings: the site is
// static and fetches nothing, so the shaders live in the code. The host is gpu.ts. They are the CPU loop's kernels
// (cpu.ts) in f32, one thread per cell or ψ cell, with the same index layout:
//   E, H: [x | y | z] blocks of N = nx·ny·nz, cell c = i + nx·(j + ny·k), H stored as η0·H, ghost node plane 0;
//   L (f32, S = nx + ny + nz per block): [kE | kH | dE | dH | len | dual], kE/kH the update factors c0Δt/(κΔ) per mesh
//   line (problem.ts `lines`), dE/dH c0Δt/Δ without κ (the ψ terms), len/dual the primal and dual lengths (energy);
//   PSI, TAB: the CPML's ψ arrays and b, c tables of cpml.ts concatenated, slabs as cpml.ts lays them out.
// Every kernel but `post` reads its part of the dispatch from the dynamic uniform `d` (one 256-byte slot per dispatch):
// d.o the workgroup offset of this part when a dispatch is split to the adapter's maxComputeWorkgroupsPerDimension
// (§9.3), d.o.w an auxiliary slot (energy ring slot, frame slot). 3D kernels are 64 × 4 × 1 over (i, j), z by the
// third dimension (§9.2); 1D kernels (ψ, conformal edges, gathers) 256 threads.
// The energy monitor (cpu.ts eMainMon/hEnergy) sums W = Σ εr·f·V·Eⁿ·Eⁿ⁺¹ + Σ V·H̃² per workgroup into partials WP,
// which `reduce` adds into one slot of the energy ring EN; the host reads it back with the records.

export const WG_X = 64, WG_Y = 4, WG_1D = 256;
/** u32 fields of the grid uniform G, in order. */
export const G_FIELDS = ['nx', 'ny', 'nz', 'N', 'S', 'nsrc', 'nprobe', 'ring', 'oSw', 'oWave', 'oOff', 'oOnH', 'oPidx', 'oPco', 'ncut', 'ngather', 'nwave', 'nhcut', 'pad2', 'pad3'] as const;
export const SLOT = 256; // bytes per dispatch slot (minUniformBufferOffsetAlignment)

const HEAD = /* wgsl */ `
struct G { ${G_FIELDS.map((f) => `${f}: u32`).join(', ')} }
struct D { o: vec4u, s: vec4u, a: vec4u, p: vec4u, q: vec4u, t0: vec4u, t1: vec4u }
@group(0) @binding(0) var<uniform> g: G;
`;
const DYN = /* wgsl */ `@group(0) @binding(1) var<uniform> d: D;\n`;
const IDX3 = /* wgsl */ `
  let i = (w.x + d.o.x) * ${WG_X}u + l.x;
  let j = (w.y + d.o.y) * ${WG_Y}u + l.y;
  let k = w.z + d.o.z;
  let N = g.N; let N2 = 2u * N; let sy = g.nx; let sz = g.nx * g.ny;
  let c = i + sy * j + sz * k;
`;
const T1 = /* wgsl */ `let t = (w.x + d.o.x) * ${WG_1D}u + l.x;`;
const REDUCE_WG = /* wgsl */ `
var<workgroup> acc: array<f32, 256>;
fn wgSum(x: f32, lid: u32) -> f32 {
  acc[lid] = x;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (lid < s) { acc[lid] = acc[lid] + acc[lid + s]; }
    workgroupBarrier();
  }
  return acc[0];
}
`;

/** H ← H − kH·curl E over i < nx − 1, j < ny − 1, k < nz − 1 (cpu.ts hMain). */
export const WGSL_H = HEAD + DYN + /* wgsl */ `
@group(0) @binding(2) var<storage, read> E: array<f32>;
@group(0) @binding(3) var<storage, read_write> H: array<f32>;
@group(0) @binding(4) var<storage, read> L: array<f32>;
@compute @workgroup_size(${WG_X}, ${WG_Y}, 1)
fn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${IDX3}
  if (i + 1u >= g.nx || j + 1u >= g.ny || k + 1u >= g.nz) { return; }
  let o = g.S;
  let kx = L[o + i]; let ky = L[o + g.nx + j]; let kz = L[o + g.nx + g.ny + k];
  let ex = E[c]; let ey = E[N + c]; let ez = E[N2 + c];
  H[c] = H[c] - (ky * (E[N2 + c + sy] - ez) - kz * (E[N + c + sz] - ey));
  H[N + c] = H[N + c] - (kz * (E[c + sz] - ex) - kx * (E[N2 + c + 1u] - ez));
  H[N2 + c] = H[N2 + c] - (kx * (E[N + c + 1u] - ey) - ky * (E[c + sy] - ex));
}
`;

const E_BIND = /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> E: array<f32>;
@group(0) @binding(3) var<storage, read> H: array<f32>;
@group(0) @binding(4) var<storage, read> CA: array<f32>;
@group(0) @binding(5) var<storage, read> CB: array<f32>;
@group(0) @binding(6) var<storage, read> L: array<f32>;
`;

/** E ← CA·E + CB·kE·curl H over i, j, k ≥ 1 (cpu.ts eMain). */
export const WGSL_E = HEAD + DYN + E_BIND + /* wgsl */ `
@compute @workgroup_size(${WG_X}, ${WG_Y}, 1)
fn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${IDX3}
  if (i < 1u || j < 1u || k < 1u || i >= g.nx || j >= g.ny || k >= g.nz) { return; }
  let kx = L[i]; let ky = L[g.nx + j]; let kz = L[g.nx + g.ny + k];
  let hx = H[c]; let hy = H[N + c]; let hz = H[N2 + c];
  E[c] = CA[c] * E[c] + CB[c] * (ky * (hz - H[N2 + c - sy]) - kz * (hy - H[N + c - sz]));
  E[N + c] = CA[N + c] * E[N + c] + CB[N + c] * (kz * (hx - H[c - sz]) - kx * (hz - H[N2 + c - 1u]));
  E[N2 + c] = CA[N2 + c] * E[N2 + c] + CB[N2 + c] * (kx * (hy - H[N + c - 1u]) - ky * (hx - H[c - sy]));
}
`;

/** The E update with the energy sum of its cell (cpu.ts eMainMon + hEnergy): one partial per workgroup into WP at
 *  the workgroup's index in the whole dispatch (d.s.x, d.s.y groups along x and y). */
export const WGSL_EMON = HEAD + DYN + E_BIND + /* wgsl */ `
@group(0) @binding(7) var<storage, read_write> WP: array<f32>;
${REDUCE_WG}
fn er(e: u32) -> f32 { let b = CB[e]; return select(0.0, (1.0 + CA[e]) / (2.0 * b), b > 0.0); }
@compute @workgroup_size(${WG_X}, ${WG_Y}, 1)
fn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${IDX3}
  var s = 0.0;
  let o4 = 4u * g.S; let o5 = 5u * g.S; let oy = g.nx; let oz = g.nx + g.ny;
  if (i < g.nx && j < g.ny && k < g.nz) {
    // H energy of the cell: DX·dY·dZ·Hx² + dX·DY·dZ·Hy² + dX·dY·DZ·Hz²
    let dX = L[o4 + i]; let dY = L[o4 + oy + j]; let dZ = L[o4 + oz + k];
    let DX = L[o5 + i]; let DY = L[o5 + oy + j]; let DZ = L[o5 + oz + k];
    let a = H[c]; let b = H[N + c]; let e = H[N2 + c];
    s = DX * dY * dZ * a * a + dX * DY * dZ * b * b + dX * dY * DZ * e * e;
    if (i >= 1u && j >= 1u && k >= 1u) {
      let kx = L[i]; let ky = L[oy + j]; let kz = L[oz + k];
      let hx = H[c]; let hy = H[N + c]; let hz = H[N2 + c];
      let e0 = E[c]; let e1 = E[N + c]; let e2 = E[N2 + c];
      let a0 = CA[c] * e0 + CB[c] * (ky * (hz - H[N2 + c - sy]) - kz * (hy - H[N + c - sz]));
      let a1 = CA[N + c] * e1 + CB[N + c] * (kz * (hx - H[c - sz]) - kx * (hz - H[N2 + c - 1u]));
      let a2 = CA[N2 + c] * e2 + CB[N2 + c] * (kx * (hy - H[N + c - 1u]) - ky * (hx - H[c - sy]));
      E[c] = a0; E[N + c] = a1; E[N2 + c] = a2;
      s = s + er(c) * dX * DY * DZ * e0 * a0 + er(N + c) * DX * dY * DZ * e1 * a1 + er(N2 + c) * DX * DY * dZ * e2 * a2;
    }
  }
  let lid = l.x + ${WG_X}u * l.y;
  let tot = wgSum(s, lid);
  if (lid == 0u) { WP[(w.x + d.o.x) + d.s.x * ((w.y + d.o.y) + d.s.y * (w.z + d.o.z))] = tot; }
}
`;

const PSI_BIND = (eRw: boolean) => /* wgsl */ `
@group(0) @binding(2) var<storage, ${eRw ? 'read_write' : 'read'}> E: array<f32>;
@group(0) @binding(3) var<storage, ${eRw ? 'read' : 'read_write'}> H: array<f32>;
@group(0) @binding(4) var<storage, read> CB: array<f32>;
@group(0) @binding(5) var<storage, read> L: array<f32>;
@group(0) @binding(6) var<storage, read_write> PSI: array<f32>;
@group(0) @binding(7) var<storage, read> T: array<f32>;
`;
// The two slabs of an axis in one dispatch: d.a = (m cells, first node of the low slab, of the high slab, threads per
// slab); d.p, d.q the ψ offsets (E1, E2, H1, H2) of the low and high slab; d.t0, d.t1 the table offsets.
const PSI_HEAD = /* wgsl */ `
  ${T1}
  let m = d.a.x; let per = d.a.w;
  if (t >= 2u * per) { return; }
  let hi = t >= per; let u = select(t, t - per, hi);
  let base = select(d.a.y, d.a.z, hi); let po = select(d.p, d.q, hi);
  let N = g.N; let N2 = 2u * N; let sz = g.nx * g.ny;
`;
const MAIN1 = `@compute @workgroup_size(${WG_1D})\nfn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {`;

/** ψ of the E update (cpu.ts psiEx, psiEy, psiEz), by the slab's normal. */
export function wgslPsiE(axis: 0 | 1 | 2): string {
  const body = [
    /* x: l + m·(j + ny·k), tables at i + nx·k */ `
  let li = u % m; let r = u / m;
  let j = 1u + r % (g.ny - 1u); let k = 1u + r / (g.ny - 1u); let i = base + li;
  let c = i + g.nx * j + sz * k; let p = li + m * (j + g.ny * k); let tt = i + g.nx * k; let dd = L[2u * g.S + i];
  let a1 = T[d.t0.x + tt] * PSI[po.x + p] + T[d.t0.y + tt] * dd * (H[N2 + c] - H[N2 + c - 1u]);
  PSI[po.x + p] = a1; E[N + c] = E[N + c] - CB[N + c] * a1;
  let a2 = T[d.t0.z + tt] * PSI[po.y + p] + T[d.t0.w + tt] * dd * (H[N + c] - H[N + c - 1u]);
  PSI[po.y + p] = a2; E[N2 + c] = E[N2 + c] + CB[N2 + c] * a2;`,
    /* y: l + m·(i + nx·k), tables at j + ny·k */ `
  let i = 1u + u % (g.nx - 1u); let r = u / (g.nx - 1u);
  let lj = r % m; let k = 1u + r / m; let j = base + lj;
  let c = i + g.nx * j + sz * k; let p = lj + m * (i + g.nx * k); let tt = j + g.ny * k; let dd = L[2u * g.S + g.nx + j];
  let a1 = T[d.t0.x + tt] * PSI[po.x + p] + T[d.t0.y + tt] * dd * (H[N2 + c] - H[N2 + c - g.nx]);
  PSI[po.x + p] = a1; E[c] = E[c] + CB[c] * a1;
  let a2 = T[d.t0.z + tt] * PSI[po.y + p] + T[d.t0.w + tt] * dd * (H[c] - H[c - g.nx]);
  PSI[po.y + p] = a2; E[N2 + c] = E[N2 + c] - CB[N2 + c] * a2;`,
    /* z: l + m·(i + nx·j), tables [bE cE bH cH] at k */ `
  let i = 1u + u % (g.nx - 1u); let r = u / (g.nx - 1u);
  let j = 1u + r % (g.ny - 1u); let lk = r / (g.ny - 1u); let k = base + lk;
  let c = i + g.nx * j + sz * k; let p = lk + m * (i + g.nx * j); let dd = L[2u * g.S + g.nx + g.ny + k];
  let b = T[d.t0.x + k]; let cc = T[d.t0.y + k] * dd;
  let a1 = b * PSI[po.x + p] + cc * (H[N + c] - H[N + c - sz]);
  PSI[po.x + p] = a1; E[c] = E[c] - CB[c] * a1;
  let a2 = b * PSI[po.y + p] + cc * (H[c] - H[c - sz]);
  PSI[po.y + p] = a2; E[N + c] = E[N + c] + CB[N + c] * a2;`,
  ][axis];
  return HEAD + DYN + PSI_BIND(true) + MAIN1 + PSI_HEAD + body + '\n}\n';
}

/** ψ of the H update (cpu.ts psiHx, psiHy, psiHz). */
export function wgslPsiH(axis: 0 | 1 | 2): string {
  const body = [
    `
  let li = u % m; let r = u / m;
  let j = r % (g.ny - 1u); let k = r / (g.ny - 1u); let i = base + li;
  let c = i + g.nx * j + sz * k; let p = li + m * (j + g.ny * k); let tt = i + g.nx * k; let dd = L[3u * g.S + i];
  let a3 = T[d.t1.z + tt] * PSI[po.z + p] + T[d.t1.w + tt] * dd * (E[N2 + c + 1u] - E[N2 + c]);
  PSI[po.z + p] = a3; H[N + c] = H[N + c] + a3;
  let a4 = T[d.t1.x + tt] * PSI[po.w + p] + T[d.t1.y + tt] * dd * (E[N + c + 1u] - E[N + c]);
  PSI[po.w + p] = a4; H[N2 + c] = H[N2 + c] - a4;`,
    `
  let i = u % (g.nx - 1u); let r = u / (g.nx - 1u);
  let lj = r % m; let k = r / m; let j = base + lj;
  let c = i + g.nx * j + sz * k; let p = lj + m * (i + g.nx * k); let tt = j + g.ny * k; let dd = L[3u * g.S + g.nx + j];
  let a3 = T[d.t1.z + tt] * PSI[po.z + p] + T[d.t1.w + tt] * dd * (E[N2 + c + g.nx] - E[N2 + c]);
  PSI[po.z + p] = a3; H[c] = H[c] - a3;
  let a4 = T[d.t1.x + tt] * PSI[po.w + p] + T[d.t1.y + tt] * dd * (E[c + g.nx] - E[c]);
  PSI[po.w + p] = a4; H[N2 + c] = H[N2 + c] + a4;`,
    `
  let i = u % (g.nx - 1u); let r = u / (g.nx - 1u);
  let j = r % (g.ny - 1u); let lk = r / (g.ny - 1u); let k = base + lk;
  let c = i + g.nx * j + sz * k; let p = lk + m * (i + g.nx * j); let dd = L[3u * g.S + g.nx + g.ny + k];
  let b = T[d.t0.z + k]; let cc = T[d.t0.w + k] * dd;
  let a3 = b * PSI[po.z + p] + cc * (E[N + c + sz] - E[N + c]);
  PSI[po.z + p] = a3; H[c] = H[c] + a3;
  let a4 = b * PSI[po.w + p] + cc * (E[c + sz] - E[c]);
  PSI[po.w + p] = a4; H[N + c] = H[N + c] - a4;`,
  ][axis];
  return HEAD + DYN + PSI_BIND(false) + MAIN1 + PSI_HEAD + body + '\n}\n';
}

/** The conformal edges (cpu.ts advance): `scale` saves E and multiplies it by f before the H update, `restore` puts
 *  it back, `energy` adds the monitor's correction εr·V·(f − 1)·Eⁿ·Eⁿ⁺¹ (host-computed weight) into WP from d.s.w.
 *  CUTS (u32): [edge | f bits | weight bits | saved E bits], ncut each. */
export const WGSL_CUT = HEAD + DYN + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> E: array<f32>;
@group(0) @binding(3) var<storage, read_write> CUTS: array<u32>;
@group(0) @binding(4) var<storage, read_write> WP: array<f32>;
${REDUCE_WG}
@compute @workgroup_size(${WG_1D})
fn scale(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.ncut;
  if (t >= n) { return; }
  let e = CUTS[t]; let x = E[e];
  CUTS[3u * n + t] = bitcast<u32>(x);
  E[e] = x * bitcast<f32>(CUTS[n + t]);
}
@compute @workgroup_size(${WG_1D})
fn restore(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.ncut;
  if (t >= n) { return; }
  E[CUTS[t]] = bitcast<f32>(CUTS[3u * n + t]);
}
@compute @workgroup_size(${WG_1D})
fn energy(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.ncut;
  var s = 0.0;
  if (t < n) { s = bitcast<f32>(CUTS[2u * n + t]) * bitcast<f32>(CUTS[3u * n + t]) * E[CUTS[t]]; }
  let tot = wgSum(s, l.x);
  if (l.x == 0u) { WP[d.s.w + w.x + d.o.x] = tot; }
}
`;

/** The H faces with an area fraction (cpu.ts advance, M6.4b): `save` keeps H before the H update, `apply` sets
 *  H = s + (H − s)/A after it and its ψ, `energy` adds the monitor's correction V·(A − 1)·H² into WP from d.s.w.
 *  HCUTS (u32): [face | 1/A bits | weight bits | saved H bits], nhcut each. */
export const WGSL_HCUT = HEAD + DYN + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> H: array<f32>;
@group(0) @binding(3) var<storage, read_write> HCUTS: array<u32>;
@group(0) @binding(4) var<storage, read_write> WP: array<f32>;
${REDUCE_WG}
@compute @workgroup_size(${WG_1D})
fn save(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.nhcut;
  if (t >= n) { return; }
  HCUTS[3u * n + t] = bitcast<u32>(H[HCUTS[t]]);
}
@compute @workgroup_size(${WG_1D})
fn apply(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.nhcut;
  if (t >= n) { return; }
  let h = HCUTS[t]; let s = bitcast<f32>(HCUTS[3u * n + t]);
  H[h] = s + (H[h] - s) * bitcast<f32>(HCUTS[n + t]);
}
@compute @workgroup_size(${WG_1D})
fn energy(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  let n = g.nhcut;
  var s = 0.0;
  if (t < n) { let x = H[HCUTS[t]]; s = bitcast<f32>(HCUTS[2u * n + t]) * x * x; }
  let tot = wgSum(s, l.x);
  if (l.x == 0u) { WP[d.s.w + w.x + d.o.x] = tot; }
}
`;

/** The energy partials (d.s.z of them) into the ring slot d.o.w. */
export const WGSL_REDUCE = HEAD + DYN + /* wgsl */ `
@group(0) @binding(2) var<storage, read> WP: array<f32>;
@group(0) @binding(3) var<storage, read_write> EN: array<f32>;
${REDUCE_WG}
@compute @workgroup_size(${WG_1D})
fn main(@builtin(local_invocation_id) l: vec3u) {
  var s = 0.0;
  for (var q = l.x; q < d.s.z; q = q + ${WG_1D}u) { s = s + WP[q]; }
  let tot = wgSum(s, l.x);
  if (l.x == 0u) { EN[d.o.w] = tot; }
}
`;

/** After the E update of step n (one workgroup): the sources E[e] += w·wave(n) (t = (n + ½)·Δt), then the record
 *  row n + 1 of every probe (Σ coef·E or Σ coef·H̃) into the ring, then the step counter. META (u32): [source edges |
 *  weights (f32 bits) | wave index | probe offsets (nprobe + 1) | on H (0/1) | probe edges | coefficients (f32 bits)]. */
export const WGSL_POST = HEAD + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> E: array<f32>;
@group(0) @binding(3) var<storage, read> H: array<f32>;
@group(0) @binding(4) var<storage, read_write> ST: array<u32>;
@group(0) @binding(5) var<storage, read> WAVE: array<f32>;
@group(0) @binding(6) var<storage, read> META: array<u32>;
@group(0) @binding(7) var<storage, read_write> REC: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) l: vec3u) {
  let n = ST[0];
  for (var q = l.x; q < g.nsrc; q = q + 64u) {
    let e = META[q];
    E[e] = E[e] + bitcast<f32>(META[g.oSw + q]) * WAVE[META[g.oWave + q] * g.nwave + n];
  }
  storageBarrier();
  let row = ((n + 1u) % g.ring) * g.nprobe;
  for (var k = l.x; k < g.nprobe; k = k + 64u) {
    let a = META[g.oOff + k]; let b = META[g.oOff + k + 1u]; let onH = META[g.oOnH + k] == 1u;
    var s = 0.0;
    for (var q = a; q < b; q = q + 1u) {
      let e = META[g.oPidx + q];
      s = s + bitcast<f32>(META[g.oPco + q]) * select(E[e], H[e], onH);
    }
    REC[row + k] = s;
  }
  storageBarrier();
  if (l.x == 0u) { ST[0] = n + 1u; }
}
`;

/** A snapshot frame: E at the gather's edges into frame slot d.o.w (snapshots.ts quantises on the host). */
export const WGSL_GATHER = HEAD + DYN + /* wgsl */ `
@group(0) @binding(2) var<storage, read> E: array<f32>;
@group(0) @binding(3) var<storage, read> GIDX: array<u32>;
@group(0) @binding(4) var<storage, read_write> SNAP: array<f32>;
@compute @workgroup_size(${WG_1D})
fn main(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_id) l: vec3u) {
  ${T1}
  if (t >= g.ngather) { return; }
  SNAP[d.o.w * g.ngather + t] = E[GIDX[t]];
}
`;
