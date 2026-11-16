// SPIKE (M0.4a), not product code.
// Browser entry of the Yee spike: the WebGPU host code. Bundled by esbuild (webgpu/runner.mjs) and called from
// Node through Playwright as window.spike.*; every function returns plain JSON.
import { makeProblem, WGSL_E, WGSL_H, WGSL_STEP, type Problem } from './yee.mts';

declare const navigator: any;
declare const GPUBufferUsage: any;
declare const GPUMapMode: any;

let device: any = null;
let adapterInfo: any = null;

const LIMIT_NAMES = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxStorageBuffersPerShaderStage',
  'maxComputeWorkgroupSizeX', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupsPerDimension',
  'maxComputeWorkgroupStorageSize', 'maxBindGroups', 'maxUniformBufferBindingSize'];

function describe(adapter: any) {
  if (!adapter) return null;
  const i = adapter.info ?? {};
  const limits: Record<string, number> = {};
  for (const k of LIMIT_NAMES) limits[k] = adapter.limits[k];
  return {
    vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description,
    isFallbackAdapter: i.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null,
    features: [...adapter.features].sort(), limits,
  };
}

async function info() {
  if (!navigator.gpu) return { gpu: false };
  const hi = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const lo = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  return { gpu: true, highPerformance: describe(hi), lowPower: describe(lo), userAgent: navigator.userAgent };
}

async function getDevice() {
  if (device) return device;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  adapterInfo = describe(adapter);
  device = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  });
  device.lost.then((e: any) => { console.error('device lost', e?.message); device = null; });
  return device;
}

interface Sim { p: Problem; advance(steps: number, perSubmit: number): Promise<number[]>; read(which: 'probe' | 'Ez'): Promise<Float32Array>; destroy(): void; }

async function setup(p: Problem): Promise<Sim> {
  const d = await getDevice();
  d.pushErrorScope('validation'); d.pushErrorScope('out-of-memory');
  const S = GPUBufferUsage.STORAGE, CS = GPUBufferUsage.COPY_SRC, CD = GPUBufferUsage.COPY_DST;
  const buf = (size: number, usage: number, data?: ArrayBufferView) => {
    const b = d.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, mappedAtCreation: !!data });
    if (data) { new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); b.unmap(); }
    return b;
  };
  const n = p.n;
  const params = new Uint32Array([p.nx, p.ny, p.nz, n, p.src, p.probe, p.steps, 0]);
  const U = buf(32, GPUBufferUsage.UNIFORM | CD, params);
  const E = buf(12 * n, S | CS | CD), H = buf(12 * n, S | CS | CD);
  const CA = buf(12 * n, S, Float32Array.from(p.ca)), CB = buf(12 * n, S, Float32Array.from(p.cb));
  const K = buf(4 * p.lines.length, S, Float32Array.from(p.lines));
  const ST = buf(4, S | CD, new Uint32Array([0])), W = buf(4 * p.steps, S, Float32Array.from(p.wave));
  const PR = buf(4 * p.steps, S | CS);
  const all = [U, E, H, CA, CB, K, ST, W, PR];
  const pipe = (code: string) => d.createComputePipeline({ layout: 'auto', compute: { module: d.createShaderModule({ code }), entryPoint: 'main' } });
  const pH = pipe(WGSL_H), pE = pipe(WGSL_E), pS = pipe(WGSL_STEP);
  const bg = (pl: any, entries: [number, any][]) => d.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: entries.map(([binding, buffer]) => ({ binding, resource: { buffer } })) });
  const bH = bg(pH, [[0, U], [1, E], [2, H], [5, K]]);
  const bE = bg(pE, [[0, U], [1, E], [2, H], [3, CA], [4, CB], [5, K]]);
  const bS = bg(pS, [[0, U], [1, E], [6, ST], [7, W], [8, PR]]);
  const oom = await d.popErrorScope(); const val = await d.popErrorScope();
  if (oom || val) { all.forEach(b => b.destroy()); throw new Error(`setup failed: ${(oom || val).message}`); }
  const gx = Math.ceil(p.nx / 64), gy = Math.ceil(p.ny / 4), gz = p.nz;

  async function advance(steps: number, perSubmit: number) {
    const submitMs: number[] = [];
    const inflight: Promise<void>[] = [];
    for (let done = 0; done < steps;) {
      const k = Math.min(perSubmit, steps - done);
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      for (let s = 0; s < k; s++) {
        pass.setPipeline(pH); pass.setBindGroup(0, bH); pass.dispatchWorkgroups(gx, gy, gz);
        pass.setPipeline(pE); pass.setBindGroup(0, bE); pass.dispatchWorkgroups(gx, gy, gz);
        pass.setPipeline(pS); pass.setBindGroup(0, bS); pass.dispatchWorkgroups(1);
      }
      pass.end();
      const t0 = performance.now();
      d.queue.submit([enc.finish()]);
      done += k;
      inflight.push(d.queue.onSubmittedWorkDone().then(() => { submitMs.push(performance.now() - t0); }));
      if (inflight.length >= 2) await inflight.shift();   // at most two submits in flight
    }
    await Promise.all(inflight);
    return submitMs;
  }
  async function read(which: 'probe' | 'Ez') {
    const src = which === 'probe' ? PR : E, off = which === 'probe' ? 0 : 8 * n, size = which === 'probe' ? 4 * p.steps : 4 * n;
    const rb = d.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | CD });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(src, off, rb, 0, size); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy();
    return out;
  }
  return { p, advance, read, destroy: () => all.forEach(b => b.destroy()) };
}

/** Runs the comparison problem; returns the probe trace and the final Ez field as plain arrays. */
async function compare(nx: number, ny: number, nz: number, steps: number) {
  const sim = await setup(makeProblem(nx, ny, nz, steps));
  try {
    await sim.advance(steps, 50);
    return { probe: Array.from(await sim.read('probe')), ez: Array.from(await sim.read('Ez')) };
  } finally { sim.destroy(); }
}

/** Measures cell updates (E and H) per second after a warm-up. */
async function rate(nx: number, ny: number, nz: number, perSubmit: number, minMs = 1500) {
  const sim = await setup(makeProblem(nx, ny, nz, 200));
  try {
    await sim.advance(20, perSubmit);
    let steps = 20, ms = 0, submitMs: number[] = [];
    for (;;) {
      const t0 = performance.now();
      submitMs = await sim.advance(steps, perSubmit);
      ms = performance.now() - t0;
      if (ms >= minMs || steps >= 20000) break;
      steps = Math.min(20000, Math.ceil(steps * Math.max(2, (1.2 * minMs) / Math.max(ms, 1))));
    }
    const probe = await sim.read('probe');
    const finite = probe.every(Number.isFinite);
    return { cells: sim.p.n, steps, ms, cellsPerSecond: (sim.p.n * steps) / (ms / 1000), perSubmit,
      maxSubmitMs: Math.max(...submitMs), finite };
  } finally { sim.destroy(); }
}

(globalThis as any).spike = { info, compare, rate, adapter: () => adapterInfo };
(globalThis as any).__ready = true;
