/* eslint-disable no-restricted-globals */
// Display host for the Python worker (P7a), imported by /python/python-worker.js after Pyodide boots and
// registered as the JS module `yotasage_display`, which lib/python/rt/vdisplay.py calls.
// Design: docs/python/notes-S4.md §6-§8. Constants must match lib/python/displayProtocol.ts.
// Every call from Python passes only numbers (addresses, lengths, ids, timeouts), so a Stop can never
// land in a Python->JS object conversion and surface as ConversionError (notes-S4 §6.1). Frames are read
// from wasm memory through pyodide._module.HEAPU8, a private Pyodide API: it is feature-checked here,
// re-read on every call (memory growth replaces it) and bounds-checked; without it vdisplay passes a
// buffer instead (present_buffer / poll_copy) and turns a ConversionError caused by Stop back into
// KeyboardInterrupt.

const CTRL_INTERRUPT = 0;
const CTRL_DISPLAY_STATE = 4;
const CTRL_FB_SEQ = 5;
const CTRL_FB_MID = 6;
const CTRL_VSYNC = 7;
const CTRL_HIDDEN = 8;
const CTRL_EV_HEAD = 9;
const CTRL_EV_TAIL = 10;

const FB_NEW = 4;
const FB_ID_SHIFT = 3;
const MAX_W = 1920;
const MAX_H = 1080;
const MAX_TITLE = 200;
const EV_CAPACITY = 256;
const EV_RECORD_BYTES = 96;

const CHUNK_MS = 50; // visible waits re-check Stop and state at least this often
const HIDDEN_CHUNK_MS = 250; // notes-S4 §5: blocked while hidden, in interruptible chunks
const FRAME_FLOOR_MS = 100; // wait_frame returns anyway when the page draws nothing for this long
const HIDDEN_PRESENT_MS = 250; // present() sleeps to ~4 fps while hidden

const VDISPLAY_SHIM = 'import sys\nimport yotasage_rt.vdisplay as _m\nsys.modules[__name__] = _m\n';

/** Registers `yotasage_display`; failures are returned to Python as negative numbers, never thrown. */
export function installDisplayHost(pyodide, ctrl, tier) {
  const mod = pyodide._module;
  const heapOk = Boolean(mod && mod.HEAPU8 instanceof Uint8Array);
  const usable = tier === 1 && ctrl instanceof Int32Array && typeof SharedArrayBuffer === 'function';

  let id = 0; // current display, 0 = none
  let nextId = 1;
  let fb = null;
  let evBytes = null;
  let frameBytes = 0;
  let back = 0;
  let lastVsync = 0;
  let lastPresentAt = 0;
  let waitedMs = 0;

  const now = () => performance.timeOrigin + performance.now();

  /** Atomics.wait that counts the time spent waiting (the worker's idle share). */
  function waitOn(slot, value, ms) {
    const t0 = performance.now();
    const r = Atomics.wait(ctrl, slot, value, ms);
    waitedMs += performance.now() - t0;
    return r;
  }

  /** True when Stop was pressed; raises KeyboardInterrupt in Python through checkInterrupt. */
  function interrupted() {
    if (Atomics.load(ctrl, CTRL_INTERRUPT) === 0) return false;
    pyodide.checkInterrupt();
    return true;
  }

  function heapRange(ptr, n) {
    const heap = mod.HEAPU8;
    if (!Number.isInteger(ptr) || !Number.isInteger(n) || ptr < 0 || n < 0 || ptr + n > heap.length) {
      return null;
    }
    return heap.subarray(ptr, ptr + n);
  }

  function open(width, height, title, scale) {
    if (!usable) return -1;
    const w = Math.min(MAX_W, Math.max(1, Math.trunc(Number(width)) || 1));
    const h = Math.min(MAX_H, Math.max(1, Math.trunc(Number(height)) || 1));
    if (id !== 0) close(id);
    const fbSab = new SharedArrayBuffer(3 * w * h * 4);
    const eventsSab = new SharedArrayBuffer(EV_CAPACITY * EV_RECORD_BYTES);
    id = nextId;
    nextId = nextId >= 0x0ffffff0 ? 1 : nextId + 1;
    fb = new Uint8Array(fbSab);
    evBytes = new Uint8Array(eventsSab);
    frameBytes = w * h * 4;
    back = 0;
    lastPresentAt = 0;
    Atomics.store(ctrl, CTRL_DISPLAY_STATE, id);
    Atomics.store(ctrl, CTRL_FB_SEQ, 0);
    Atomics.store(ctrl, CTRL_FB_MID, (id << FB_ID_SHIFT) | 1);
    // Events written for an earlier display are skipped: the ring starts at the page's current head.
    Atomics.store(ctrl, CTRL_EV_TAIL, Atomics.load(ctrl, CTRL_EV_HEAD));
    lastVsync = Atomics.load(ctrl, CTRL_VSYNC);
    const s = scale === 'pixel' ? 'pixel' : Number.isInteger(scale) && scale >= 1 && scale <= 8 ? scale : 'fit';
    self.postMessage({
      type: 'display.open',
      id,
      width: w,
      height: h,
      title: Array.from(String(title ?? '')).slice(0, MAX_TITLE).join(''),
      scale: s,
      fbSab,
      eventsSab,
    });
    return id;
  }

  function close(which) {
    if (id === 0 || which !== id) return 0;
    Atomics.store(ctrl, CTRL_DISPLAY_STATE, 0);
    self.postMessage({ type: 'display.close', id });
    id = 0;
    fb = null;
    evBytes = null;
    return 0;
  }

  function hiddenThrottle() {
    if (Atomics.load(ctrl, CTRL_HIDDEN) !== 1) {
      lastPresentAt = performance.now();
      return;
    }
    const until = lastPresentAt + HIDDEN_PRESENT_MS;
    while (Atomics.load(ctrl, CTRL_HIDDEN) === 1) {
      if (interrupted()) return;
      const left = until - performance.now();
      if (left <= 0) break;
      waitOn(CTRL_VSYNC, Atomics.load(ctrl, CTRL_VSYNC), Math.min(left, CHUNK_MS));
    }
    lastPresentAt = performance.now();
  }

  function commit(src, which) {
    fb.set(src, back * frameBytes);
    const prev = Atomics.exchange(ctrl, CTRL_FB_MID, (which << FB_ID_SHIFT) | FB_NEW | back);
    back = prev & 3;
    if (back > 2) back = 0;
    Atomics.add(ctrl, CTRL_FB_SEQ, 1);
    hiddenThrottle();
    return 0;
  }

  function present(which, ptr, n) {
    if (which !== id || id === 0) return -2;
    if (n !== frameBytes) return -3;
    const src = heapRange(ptr, n);
    if (!src) return -4;
    return commit(src, which);
  }

  function presentBuffer(which, buf) {
    if (which !== id || id === 0) return -2;
    const view = buf.getBuffer('u8');
    try {
      if (view.data.byteLength !== frameBytes) return -3;
      return commit(view.data, which);
    } finally {
      view.release();
    }
  }

  function pending() {
    const n = (Atomics.load(ctrl, CTRL_EV_HEAD) - Atomics.load(ctrl, CTRL_EV_TAIL)) | 0;
    if (n < 0 || n > EV_CAPACITY) {
      // A corrupted counter (only a program writing the control buffer can cause it): start over.
      Atomics.store(ctrl, CTRL_EV_TAIL, Atomics.load(ctrl, CTRL_EV_HEAD));
      return 0;
    }
    return n;
  }

  /** Copies up to `cap` event records into dst (a Uint8Array view), advancing the tail. */
  function drain(dst, cap) {
    if (!evBytes) return 0;
    const n = Math.min(pending(), cap, Math.floor(dst.length / EV_RECORD_BYTES));
    let tail = Atomics.load(ctrl, CTRL_EV_TAIL);
    for (let i = 0; i < n; i += 1) {
      const at = ((tail >>> 0) % EV_CAPACITY) * EV_RECORD_BYTES;
      dst.set(evBytes.subarray(at, at + EV_RECORD_BYTES), i * EV_RECORD_BYTES);
      tail = (tail + 1) | 0;
    }
    Atomics.store(ctrl, CTRL_EV_TAIL, tail);
    return n;
  }

  function poll(which, ptr, cap) {
    if (which !== id || id === 0) return -2;
    const dst = heapRange(ptr, cap * EV_RECORD_BYTES);
    if (!dst) return -4;
    return drain(dst, cap);
  }

  function pollCopy(which) {
    const out = new Uint8Array(EV_CAPACITY * EV_RECORD_BYTES);
    const n = which === id && id !== 0 ? drain(out, EV_CAPACITY) : 0;
    return out.subarray(0, n * EV_RECORD_BYTES);
  }

  /** 1 when events are waiting, 0 on timeout or Stop; timeoutMs < 0 waits without limit. */
  function waitEvent(which, timeoutMs) {
    if (which !== id || id === 0) return -2;
    const deadline = timeoutMs < 0 ? Infinity : performance.now() + timeoutMs;
    for (;;) {
      if (pending() > 0) return 1;
      if (interrupted()) return 0;
      const left = deadline - performance.now();
      if (left <= 0) return 0;
      waitOn(CTRL_EV_HEAD, Atomics.load(ctrl, CTRL_EV_HEAD), Math.min(left, HIDDEN_CHUNK_MS));
    }
  }

  /** 1 on a new page frame, 0 when the page drew nothing for 100 ms (or Stop); blocks while hidden. */
  function waitFrame(which) {
    if (which !== id || id === 0) return -2;
    let start = performance.now();
    for (;;) {
      const v = Atomics.load(ctrl, CTRL_VSYNC);
      const hidden = Atomics.load(ctrl, CTRL_HIDDEN) === 1;
      if (!hidden && v !== lastVsync) {
        lastVsync = v;
        return 1;
      }
      if (interrupted()) return 0;
      if (hidden) {
        start = performance.now();
        waitOn(CTRL_VSYNC, v, HIDDEN_CHUNK_MS);
        continue;
      }
      const left = start + FRAME_FLOOR_MS - performance.now();
      if (left <= 0) {
        lastVsync = v;
        return 0;
      }
      waitOn(CTRL_VSYNC, v, Math.min(left, CHUNK_MS));
    }
  }

  pyodide.registerJsModule('yotasage_display', {
    tier,
    usable,
    heap_ok: heapOk,
    max_width: MAX_W,
    max_height: MAX_H,
    ev_capacity: EV_CAPACITY,
    ev_record_bytes: EV_RECORD_BYTES,
    open,
    close,
    present,
    present_buffer: presentBuffer,
    poll,
    poll_copy: pollCopy,
    wait_event: waitEvent,
    wait_frame: waitFrame,
    now_ms: now,
    waited_ms: () => waitedMs,
    hidden: () => (usable && Atomics.load(ctrl, CTRL_HIDDEN) === 1 ? 1 : 0),
    current: () => id,
  });

  // `import vdisplay` resolves to yotasage_rt.vdisplay (a file of the same name in /workspace wins).
  try {
    pyodide.FS.writeFile('/vdisplay.py', VDISPLAY_SHIM, { encoding: 'utf8' });
  } catch {
    // vdisplay stays importable as yotasage_rt.vdisplay
  }

  // vdisplay needs NumPy; the bundled-import scan of runs and console lines cannot see that import.
  const scan = pyodide.loadPackagesFromImports;
  if (typeof scan === 'function') {
    try {
      pyodide.loadPackagesFromImports = (code, options) =>
        scan.call(
          pyodide,
          typeof code === 'string' && /\bvdisplay\b/.test(code) ? `${code}\nimport numpy\n` : code,
          options,
        );
    } catch {
      // read-only API object: vdisplay then explains that NumPy is missing
    }
  }
}
