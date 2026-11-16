// SPIKE (M0.4a), not product code.
// The 3D Yee update shared by the JavaScript runs (Node) and the WebGPU runs (Edge, bundled by esbuild):
// the test problem, the JavaScript kernels (Float32Array or Float64Array) and the WGSL kernels.
//
// Grid: nodes 0..n-1 per axis; node plane 0 is a ghost layer, PEC walls on node planes 1 and n-1.
// Field arrays hold three components as blocks: E = [Ex | Ey | Ez], each N = nx*ny*nz long, cell c = i + nx*(j + ny*k).
// Ex(i+1/2, j, k), Ey(i, j+1/2, k), Ez(i, j, k+1/2); Hx(i, j+1/2, k+1/2), Hy(i+1/2, j, k+1/2), Hz(i+1/2, j+1/2, k).
// H is stored as eta0*H (same scale as E). Updates:
//   E = CA*E + CB*(k_a*dH_b - k_b*dH_a)    (k = c0*dt/spacing per mesh line, CB = 1/(eps_r*(1+a)))
//   H = H - (k_a*dE_b - k_b*dE_a)
// PEC (walls, sheets) and everything outside the domain are E edges with CA = CB = 0.
// Order of one step: H, E, then the step kernel (soft Ez source, probe recorded, step counter + 1).

export interface Problem {
  nx: number; ny: number; nz: number; n: number;
  steps: number;
  src: number; probe: number;       // cell indices of the Ez source and the Ez probe
  ca: Float64Array; cb: Float64Array; // 3N each
  lines: Float64Array;              // [kxE(nx) kyE(ny) kzE(nz) kxH(nx) kyH(ny) kzH(nz)]
  wave: Float64Array;               // source added to Ez[src] after step s
  courant: number;
}

export function makeProblem(nx: number, ny: number, nz: number, steps: number): Problem {
  const n = nx * ny * nz, sy = nx, sz = nx * ny;
  const ca = new Float64Array(3 * n), cb = new Float64Array(3 * n);
  const kint = Math.floor(nz / 2);                 // dielectric (eps_r 4.3, slight loss) below node plane kint
  const epsR = 4.3, a = 2e-4;                      // a = sigma*dt/(2*eps)
  const setE = (comp: number, c: number, eps: number, loss: number) => {
    ca[comp * n + c] = (1 - loss) / (1 + loss); cb[comp * n + c] = 1 / (eps * (1 + loss));
  };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const c = i + sy * j + sz * k;
    const epsT = k < kint ? epsR : k === kint ? (epsR + 1) / 2 : 1;  // Ex, Ey on node plane k
    const lossT = k < kint ? a : k === kint ? a / 2 : 0;
    const epsZ = k < kint ? epsR : 1;                                 // Ez between planes k and k+1
    const lossZ = k < kint ? a : 0;
    if (i <= nx - 2 && j >= 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) setE(0, c, epsT, lossT);
    if (i >= 2 && i <= nx - 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) setE(1, c, epsT, lossT);
    if (i >= 2 && i <= nx - 2 && j >= 2 && j <= ny - 2 && k <= nz - 2) setE(2, c, epsZ, lossZ);
  }
  // a PEC sheet on the interface (a "trace"): tangential E zero by coefficients
  for (let j = Math.floor(ny * 0.4); j <= Math.floor(ny * 0.6); j++)
    for (let i = Math.floor(nx * 0.25); i <= Math.floor(nx * 0.5); i++) {
      const c = i + sy * j + sz * kint;
      ca[c] = cb[c] = 0; ca[n + c] = cb[n + c] = 0;
    }
  const courant = 0.99 / Math.sqrt(3);             // uniform cube cells: c0*dt/h
  const lines = new Float64Array(2 * (nx + ny + nz)).fill(courant);
  const wave = new Float64Array(steps);
  const w = 12, n0 = 60;                           // differentiated Gaussian (no DC), in steps
  for (let s = 0; s < steps; s++) { const t = (s - n0) / w; wave[s] = -t * Math.exp(-t * t); }
  const src = Math.floor(nx / 3) + sy * Math.floor(ny / 2) + sz * Math.floor(nz * 0.75);
  const probe = Math.floor(2 * nx / 3) + sy * Math.floor(ny / 3) + sz * Math.floor(nz * 0.7);
  return { nx, ny, nz, n, steps, src, probe, ca, cb, lines, wave, courant };
}

// ---------- JavaScript kernels (monomorphic per array type through new Function) ----------

const H_SRC = `
const sy = nx, sz = nx * ny;
for (let k = 0; k < nz - 1; k++) { const kzh = kzH[k];
  for (let j = 0; j < ny - 1; j++) { const kyh = kyH[j]; let c = sy * j + sz * k;
    for (let i = 0; i < nx - 1; i++, c++) { const kxh = kxH[i];
      const ex = Ex[c], ey = Ey[c], ez = Ez[c];
      Hx[c] -= kyh * (Ez[c + sy] - ez) - kzh * (Ey[c + sz] - ey);
      Hy[c] -= kzh * (Ex[c + sz] - ex) - kxh * (Ez[c + 1] - ez);
      Hz[c] -= kxh * (Ey[c + 1] - ey) - kyh * (Ex[c + sy] - ex);
    } } }`;

const E_SRC = `
const sy = nx, sz = nx * ny;
for (let k = 1; k < nz; k++) { const kze = kzE[k];
  for (let j = 1; j < ny; j++) { const kye = kyE[j]; let c = 1 + sy * j + sz * k;
    for (let i = 1; i < nx; i++, c++) { const kxe = kxE[i];
      const hx = Hx[c], hy = Hy[c], hz = Hz[c];
      Ex[c] = CAx[c] * Ex[c] + CBx[c] * (kye * (hz - Hz[c - sy]) - kze * (hy - Hy[c - sz]));
      Ey[c] = CAy[c] * Ey[c] + CBy[c] * (kze * (hx - Hx[c - sz]) - kxe * (hz - Hz[c - 1]));
      Ez[c] = CAz[c] * Ez[c] + CBz[c] * (kxe * (hy - Hy[c - 1]) - kye * (hx - Hx[c - sy]));
    } } }`;

type FA = Float32Array | Float64Array;

export class JsYee {
  E: FA; H: FA; probeTrace: Float64Array; step = 0;
  private stepH: () => void; private stepE: () => void;
  private wave: FA; private p: Problem;
  constructor(p: Problem, f64: boolean) {
    const A = f64 ? Float64Array : Float32Array;
    this.p = p;
    const n = p.n;
    this.E = new A(3 * n); this.H = new A(3 * n);
    const ca = A.from(p.ca), cb = A.from(p.cb), L = A.from(p.lines);
    this.wave = A.from(p.wave);
    this.probeTrace = new Float64Array(p.steps);
    const v = (a: FA, o: number, len: number) => a.subarray(o, o + len);
    const { nx, ny, nz } = p;
    const args = {
      nx, ny, nz,
      Ex: v(this.E, 0, n), Ey: v(this.E, n, n), Ez: v(this.E, 2 * n, n),
      Hx: v(this.H, 0, n), Hy: v(this.H, n, n), Hz: v(this.H, 2 * n, n),
      CAx: v(ca, 0, n), CAy: v(ca, n, n), CAz: v(ca, 2 * n, n),
      CBx: v(cb, 0, n), CBy: v(cb, n, n), CBz: v(cb, 2 * n, n),
      kxE: v(L, 0, nx), kyE: v(L, nx, ny), kzE: v(L, nx + ny, nz),
      kxH: v(L, nx + ny + nz, nx), kyH: v(L, 2 * nx + ny + nz, ny), kzH: v(L, 2 * nx + 2 * ny + nz, nz),
    };
    const names = Object.keys(args);
    const vals = names.map(k => (args as any)[k]);
    const make = (body: string) => { const f = new Function(...names, body) as (...a: unknown[]) => void; return () => f(...vals); };
    // separate Function objects per instance and precision keep V8's feedback monomorphic
    this.stepH = make(H_SRC); this.stepE = make(E_SRC);
  }
  run(steps: number) {
    const ez = this.E.subarray(2 * this.p.n);
    for (let s = 0; s < steps; s++) {
      this.stepH(); this.stepE();
      const w = this.step < this.wave.length ? this.wave[this.step] : 0;
      ez[this.p.src] += w;
      if (this.step < this.probeTrace.length) this.probeTrace[this.step] = ez[this.p.probe];
      this.step++;
    }
  }
}

// ---------- WGSL ----------

const HEADER = /* wgsl */ `
struct P { nx: u32, ny: u32, nz: u32, n: u32, src: u32, probe: u32, nsteps: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: P;
`;

export const WGSL_H = HEADER + /* wgsl */ `
@group(0) @binding(1) var<storage, read> E: array<f32>;
@group(0) @binding(2) var<storage, read_write> H: array<f32>;
@group(0) @binding(5) var<storage, read> K: array<f32>;
@compute @workgroup_size(64, 4, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; let j = g.y; let k = g.z;
  if (i + 1u >= p.nx || j + 1u >= p.ny || k + 1u >= p.nz) { return; }
  let sy = p.nx; let sz = p.nx * p.ny; let n = p.n; let n2 = 2u * n;
  let o = p.nx + p.ny + p.nz;
  let kxh = K[o + i]; let kyh = K[o + p.nx + j]; let kzh = K[o + p.nx + p.ny + k];
  let c = i + sy * j + sz * k;
  let ex = E[c]; let ey = E[n + c]; let ez = E[n2 + c];
  H[c]      = H[c]      - (kyh * (E[n2 + c + sy] - ez) - kzh * (E[n + c + sz] - ey));
  H[n + c]  = H[n + c]  - (kzh * (E[c + sz] - ex) - kxh * (E[n2 + c + 1u] - ez));
  H[n2 + c] = H[n2 + c] - (kxh * (E[n + c + 1u] - ey) - kyh * (E[c + sy] - ex));
}`;

export const WGSL_E = HEADER + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> E: array<f32>;
@group(0) @binding(2) var<storage, read> H: array<f32>;
@group(0) @binding(3) var<storage, read> CA: array<f32>;
@group(0) @binding(4) var<storage, read> CB: array<f32>;
@group(0) @binding(5) var<storage, read> K: array<f32>;
@compute @workgroup_size(64, 4, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; let j = g.y; let k = g.z;
  if (i < 1u || j < 1u || k < 1u || i >= p.nx || j >= p.ny || k >= p.nz) { return; }
  let sy = p.nx; let sz = p.nx * p.ny; let n = p.n; let n2 = 2u * n;
  let kxe = K[i]; let kye = K[p.nx + j]; let kze = K[p.nx + p.ny + k];
  let c = i + sy * j + sz * k;
  let hx = H[c]; let hy = H[n + c]; let hz = H[n2 + c];
  E[c]      = CA[c] * E[c] + CB[c] * (kye * (hz - H[n2 + c - sy]) - kze * (hy - H[n + c - sz]));
  E[n + c]  = CA[n + c] * E[n + c] + CB[n + c] * (kze * (hx - H[c - sz]) - kxe * (hz - H[n2 + c - 1u]));
  E[n2 + c] = CA[n2 + c] * E[n2 + c] + CB[n2 + c] * (kxe * (hy - H[n + c - 1u]) - kye * (hx - H[c - sy]));
}`;

export const WGSL_STEP = HEADER + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> E: array<f32>;
@group(0) @binding(6) var<storage, read_write> st: array<u32>;
@group(0) @binding(7) var<storage, read> W: array<f32>;
@group(0) @binding(8) var<storage, read_write> PR: array<f32>;
@compute @workgroup_size(1)
fn main() {
  let s = st[0];
  let iz = 2u * p.n + p.src;
  if (s < p.nsteps) {
    E[iz] = E[iz] + W[s];
    PR[s] = E[2u * p.n + p.probe];
  }
  st[0] = s + 1u;
}`;
