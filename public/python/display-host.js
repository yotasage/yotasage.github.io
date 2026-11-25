/* eslint-disable no-restricted-globals */
// Display host for the Python worker (P7a, P7b), imported by /python/python-worker.js after Pyodide
// boots and registered as the JS module `yotasage_display`, which lib/python/rt/vdisplay.py calls.
// Design: docs/python/notes-S4.md §6-§8, notes-P7a.md, notes-P7b.md. Constants must match
// lib/python/displayProtocol.ts.
// Every call from Python passes only numbers (addresses, lengths, ids, timeouts), so a Stop can never
// land in a Python->JS object conversion and surface as ConversionError (notes-S4 §6.1). Frames and
// command batches are read from wasm memory through pyodide._module.HEAPU8, a private Pyodide API: it
// is feature-checked here, re-read on every call (memory growth replaces it) and bounds-checked;
// without it vdisplay passes buffers instead (present_buffer / poll_copy) and turns a ConversionError
// caused by Stop back into KeyboardInterrupt.
// A frame's pixels and its draw commands share one slot index of two triple buffers (fbSab, cmdSab),
// so one swap on CTRL_FB_MID publishes both. Commands that do not fit a slot go by display.batch
// (transferred), at most one in flight: the page counts received batches in CTRL_ACK.

const CTRL_INTERRUPT = 0;
const CTRL_DISPLAY_STATE = 4;
const CTRL_FB_SEQ = 5;
const CTRL_FB_MID = 6;
const CTRL_VSYNC = 7;
const CTRL_HIDDEN = 8;
const CTRL_EV_HEAD = 9;
const CTRL_EV_TAIL = 10;
const CTRL_ACK = 12;
const CTRL_CLOSE_REQ = 14;

const FB_NEW = 4;
const FB_ID_SHIFT = 3;
const MAX_W = 1920;
const MAX_H = 1080;
const MAX_TITLE = 200;
const EV_CAPACITY = 256;
const EV_RECORD_BYTES = 96;
const CMD_SLOT_BYTES = 256 * 1024;
const CMD_HEADER_BYTES = 16;
const CMD_SLOT_PAYLOAD = CMD_SLOT_BYTES - CMD_HEADER_BYTES;
const CMD_F_PIXELS = 1;
const CMD_F_EXTERNAL = 2;
const MAX_BATCH = 4 * 1024 * 1024;

const CHUNK_MS = 50; // visible waits re-check Stop and state at least this often
const HIDDEN_CHUNK_MS = 250; // notes-S4 §5: blocked while hidden, in interruptible chunks
const FRAME_FLOOR_MS = 100; // wait_frame returns anyway when the page draws nothing for this long
const HIDDEN_PRESENT_MS = 250; // present() sleeps to ~4 fps while hidden
const ACK_WAIT_MS = 100; // a batch whose predecessor is not received by then is dropped (no renderer)

// Return codes: -2 not the open display, -3 wrong size, -4 outside wasm memory, -5 batch too large,
// -6 the visitor closed this display (vdisplay then stays quiet instead of raising).
const GONE = -2;
const VISITOR_CLOSED = -6;

const VDISPLAY_SHIM = 'import sys\nimport yotasage_rt.vdisplay as _m\nsys.modules[__name__] = _m\n';

/** Registers `yotasage_display`; failures are returned to Python as negative numbers, never thrown. */
export function installDisplayHost(pyodide, ctrl, tier) {
  const mod = pyodide._module;
  const heapOk = Boolean(mod && mod.HEAPU8 instanceof Uint8Array);
  const usable = tier === 1 && ctrl instanceof Int32Array && typeof SharedArrayBuffer === 'function';

  let id = 0; // current display, 0 = none
  let nextId = 1;
  let visitorClosedId = 0; // the last display the visitor closed
  let fb = null;
  let evSab = null;
  let evBytes = null;
  let cmdU8 = null;
  let cmdI32 = null;
  let frameBytes = 0;
  let back = 0;
  let frameSeq = 0;
  let posted = 0; // display.batch messages posted (compared with CTRL_ACK)
  let lastVsync = 0;
  let lastPresentAt = 0;
  let waitedMs = 0;
  let title = '';
  let scale = 'fit';
  const counts = { posted: 0, dropped: 0 };

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

  function cleanScale(s) {
    if (s === 'pixel' || s === 'window') return s;
    return Number.isInteger(s) && s >= 1 && s <= 8 ? s : 'fit';
  }

  /** Allocates the buffers of a display of w x h and announces it; events keep their ring on resize. */
  function announce(w, h, keepEvents) {
    const fbSab = new SharedArrayBuffer(3 * w * h * 4);
    const cmdSab = new SharedArrayBuffer(3 * CMD_SLOT_BYTES);
    if (!keepEvents || !evSab) evSab = new SharedArrayBuffer(EV_CAPACITY * EV_RECORD_BYTES);
    id = nextId;
    nextId = nextId >= 0x0ffffff0 ? 1 : nextId + 1;
    fb = new Uint8Array(fbSab);
    evBytes = new Uint8Array(evSab);
    cmdU8 = new Uint8Array(cmdSab);
    cmdI32 = new Int32Array(cmdSab);
    frameBytes = w * h * 4;
    back = 0;
    lastPresentAt = 0;
    posted = Atomics.load(ctrl, CTRL_ACK);
    Atomics.store(ctrl, CTRL_CLOSE_REQ, 0);
    Atomics.store(ctrl, CTRL_DISPLAY_STATE, id);
    Atomics.store(ctrl, CTRL_FB_SEQ, 0);
    Atomics.store(ctrl, CTRL_FB_MID, (id << FB_ID_SHIFT) | 1);
    // Events written for an earlier display are skipped: the ring starts at the page's current head.
    if (!keepEvents) Atomics.store(ctrl, CTRL_EV_TAIL, Atomics.load(ctrl, CTRL_EV_HEAD));
    lastVsync = Atomics.load(ctrl, CTRL_VSYNC);
    self.postMessage({ type: 'display.open', id, width: w, height: h, title, scale, fbSab, eventsSab: evSab, cmdSab });
    return id;
  }

  function clampSize(v, max) {
    return Math.min(max, Math.max(1, Math.trunc(Number(v)) || 1));
  }

  function open(width, height, newTitle, newScale) {
    if (!usable) return -1;
    if (id !== 0) close(id);
    title = Array.from(String(newTitle ?? '')).slice(0, MAX_TITLE).join('');
    scale = cleanScale(newScale);
    return announce(clampSize(width, MAX_W), clampSize(height, MAX_H), false);
  }

  function close(which) {
    if (id === 0 || which !== id) return 0;
    Atomics.store(ctrl, CTRL_DISPLAY_STATE, 0);
    self.postMessage({ type: 'display.close', id });
    id = 0;
    fb = null;
    evBytes = null;
    cmdU8 = null;
    cmdI32 = null;
    return 0;
  }

  /** 0 when `which` is the open display, else GONE or VISITOR_CLOSED (closing it when just asked). */
  function live(which) {
    if (which !== id || id === 0) return which === visitorClosedId && which !== 0 ? VISITOR_CLOSED : GONE;
    if (Atomics.load(ctrl, CTRL_CLOSE_REQ) === id) {
      visitorClosedId = id;
      close(id);
      return VISITOR_CLOSED;
    }
    return 0;
  }

  /** 0 open, 1 replaced or closed by the program, 2 closed by the visitor. */
  function state(which) {
    const rc = live(which);
    return rc === 0 ? 0 : rc === VISITOR_CLOSED ? 2 : 1;
  }

  /** New buffers of w x h for the open display, under a new id (the page treats it as a new frame source). */
  function resize(which, width, height) {
    const rc = live(which);
    if (rc !== 0) return rc;
    return announce(clampSize(width, MAX_W), clampSize(height, MAX_H), true);
  }

  function hiddenThrottle() {
    if (Atomics.load(ctrl, CTRL_HIDDEN) !== 1) {
      lastPresentAt = performance.now();
      return;
    }
    const until = lastPresentAt + HIDDEN_PRESENT_MS;
    while (Atomics.load(ctrl, CTRL_HIDDEN) === 1) {
      if (interrupted()) return;
      if (Atomics.load(ctrl, CTRL_CLOSE_REQ) === id) break;
      const left = until - performance.now();
      if (left <= 0) break;
      waitOn(CTRL_VSYNC, Atomics.load(ctrl, CTRL_VSYNC), Math.min(left, CHUNK_MS));
    }
    lastPresentAt = performance.now();
  }

  /** Posts a batch too large for its slot once the page has received the previous one. */
  function postBatch(cmd, which, seq) {
    const deadline = performance.now() + ACK_WAIT_MS;
    for (;;) {
      const ack = Atomics.load(ctrl, CTRL_ACK);
      if (((posted - ack) | 0) <= 0) break;
      if (interrupted()) return false;
      const left = deadline - performance.now();
      if (left <= 0) return false;
      waitOn(CTRL_ACK, ack, Math.min(left, CHUNK_MS));
    }
    const copy = cmd.slice();
    posted = (posted + 1) | 0;
    self.postMessage({ type: 'display.batch', id: which, seq, buf: copy.buffer }, [copy.buffer]);
    counts.posted += 1;
    return true;
  }

  /** Writes the frame into the back slots (pixels when given, commands when given) and swaps. */
  function commit(src, cmd, which) {
    const slot = back;
    if (src) fb.set(src, slot * frameBytes);
    frameSeq = (frameSeq % 0x7ffffffe) + 1;
    let flags = src ? CMD_F_PIXELS : 0;
    let len = 0;
    if (cmd && cmd.length > 0) {
      if (cmd.length <= CMD_SLOT_PAYLOAD) {
        cmdU8.set(cmd, slot * CMD_SLOT_BYTES + CMD_HEADER_BYTES);
        len = cmd.length;
      } else if (postBatch(cmd, which, frameSeq)) {
        flags |= CMD_F_EXTERNAL;
        len = cmd.length;
      } else {
        counts.dropped += 1;
      }
    }
    const h = (slot * CMD_SLOT_BYTES) >> 2;
    cmdI32[h] = len;
    cmdI32[h + 1] = flags;
    cmdI32[h + 2] = frameSeq;
    const prev = Atomics.exchange(ctrl, CTRL_FB_MID, (which << FB_ID_SHIFT) | FB_NEW | slot);
    back = prev & 3;
    if (back > 2) back = 0;
    Atomics.add(ctrl, CTRL_FB_SEQ, 1);
    hiddenThrottle();
    return 0;
  }

  /** ptr/n: the pixels (n 0: the frame has none); cptr/clen: the draw commands (clen 0: none). */
  function present(which, ptr, n, cptr, clen) {
    const rc = live(which);
    if (rc !== 0) return rc;
    let src = null;
    if (n !== 0) {
      if (n !== frameBytes) return -3;
      src = heapRange(ptr, n);
      if (!src) return -4;
    }
    let cmd = null;
    if (clen) {
      if (clen > MAX_BATCH) return -5;
      cmd = heapRange(cptr, clen);
      if (!cmd) return -4;
    }
    return commit(src, cmd, which);
  }

  function presentBuffer(which, pixels, commands) {
    const rc = live(which);
    if (rc !== 0) return rc;
    const pv = pixels ? pixels.getBuffer('u8') : null;
    const cv = commands ? commands.getBuffer('u8') : null;
    try {
      if (pv && pv.data.byteLength !== frameBytes) return -3;
      if (cv && cv.data.byteLength > MAX_BATCH) return -5;
      return commit(pv ? pv.data : null, cv ? cv.data : null, which);
    } finally {
      pv?.release();
      cv?.release();
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
    const rc = live(which);
    if (rc !== 0) return rc;
    const dst = heapRange(ptr, cap * EV_RECORD_BYTES);
    if (!dst) return -4;
    return drain(dst, cap);
  }

  function pollCopy(which) {
    const out = new Uint8Array(EV_CAPACITY * EV_RECORD_BYTES);
    const n = live(which) === 0 ? drain(out, EV_CAPACITY) : 0;
    return out.subarray(0, n * EV_RECORD_BYTES);
  }

  /** 1 when events are waiting, 0 on timeout or Stop; timeoutMs < 0 waits without limit. */
  function waitEvent(which, timeoutMs) {
    const deadline = timeoutMs < 0 ? Infinity : performance.now() + timeoutMs;
    for (;;) {
      const rc = live(which);
      if (rc !== 0) return rc;
      if (pending() > 0) return 1;
      if (interrupted()) return 0;
      const left = deadline - performance.now();
      if (left <= 0) return 0;
      waitOn(CTRL_EV_HEAD, Atomics.load(ctrl, CTRL_EV_HEAD), Math.min(left, HIDDEN_CHUNK_MS));
    }
  }

  /** 1 on a new page frame, 0 when the page drew nothing for 100 ms (or Stop); blocks while hidden. */
  function waitFrame(which) {
    let start = performance.now();
    for (;;) {
      const rc = live(which);
      if (rc !== 0) return rc;
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

  /** Sleeps ms (Stop and a visitor close end it early): a closed display's wait_frame does not spin. */
  function nap(ms) {
    const deadline = performance.now() + ms;
    for (;;) {
      if (interrupted()) return 0;
      const left = deadline - performance.now();
      if (left <= 0) return 0;
      waitOn(CTRL_VSYNC, Atomics.load(ctrl, CTRL_VSYNC), Math.min(left, CHUNK_MS));
    }
  }

  pyodide.registerJsModule('yotasage_display', {
    tier,
    usable,
    heap_ok: heapOk,
    max_width: MAX_W,
    max_height: MAX_H,
    max_batch: MAX_BATCH,
    slot_payload: CMD_SLOT_PAYLOAD,
    ev_capacity: EV_CAPACITY,
    ev_record_bytes: EV_RECORD_BYTES,
    open,
    close,
    resize,
    state,
    present,
    present_buffer: presentBuffer,
    poll,
    poll_copy: pollCopy,
    wait_event: waitEvent,
    wait_frame: waitFrame,
    nap,
    now_ms: now,
    waited_ms: () => waitedMs,
    batches_posted: () => counts.posted,
    batches_dropped: () => counts.dropped,
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
