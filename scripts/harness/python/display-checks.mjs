// Part B (8): P7a display engine (PYTHON_PARTS=display) in Edge, Firefox and WebKit on /python/harness:
// vdisplay frames reach the harness canvas through the shared triple buffer, wait_frame pacing, a busy
// present() loop keeps the page's frames coming, Stop in busy / wait_frame / wait_event loops raises
// KeyboardInterrupt (never ConversionError, also on the buffer fallback), input latency through the
// events ring, the hidden throttle, size caps, forged display.* messages, the one-window rule and the
// Tier 2 error. Numbers are printed so the step notes can quote them. P7b's draw-command checks are in
// display-draw-checks.mjs and run at the end of this part.
import { waitHarnessReady } from './corpus-checks.mjs';
import { runDisplayDrawChecks } from './display-draw-checks.mjs';

const median = (a) => {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));

/** In-page helper: runs code; stdout markers trigger declarative actions (stop, stats, hide, pushes). */
function installRunner() {
  window.__dispRun = async (code, plan = {}) => {
    const { client, renderer } = window.__disp;
    let out = '';
    let err = '';
    const marks = {};
    const snaps = {};
    let stopPromise = null;
    let stopAt = 0;
    const timers = [];
    const pushes = [];
    const fired = new Set();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const doPushes = async (list) => {
      for (const p of list) {
        if (p.k === 'wait') await sleep(p.ms);
        else if (p.k === 'pointer') renderer.pushPointer(p.kind, p.x, p.y, p);
        else if (p.k === 'wheel') renderer.pushWheel(p.x, p.y, p.dx, p.dy, p.mods || 0);
        else if (p.k === 'key') renderer.pushKey(p.kind, p.key, p.code, p.mods || 0, Boolean(p.repeat));
        else if (p.k === 'moves') {
          for (let i = 0; i < p.n; i += 1) {
            renderer.pushPointer('move', p.x + (i % 50), p.y, {});
            if (p.every) await sleep(p.every);
          }
        }
      }
    };
    const fire = (ops) => {
      for (const op of ops) {
        const run = () => {
          if (op.do === 'stop') {
            stopAt = performance.now();
            stopPromise = client.stop();
          } else if (op.do === 'reset') {
            renderer.resetStats();
            snaps[`${op.name}At`] = performance.now();
          } else if (op.do === 'stats') {
            snaps[op.name] = { ...renderer.stats(), at: performance.now() };
          } else if (op.do === 'hide') {
            renderer.setHidden(Boolean(op.hidden));
          } else if (op.do === 'push') {
            pushes.push(doPushes(op.list));
          } else if (op.do === 'resize') {
            snaps[op.name || 'resize'] = renderer.requestResize(op.w, op.h);
          } else if (op.do === 'close') {
            snaps[op.name || 'close'] = { ok: renderer.requestClose(), epoch: performance.timeOrigin + performance.now() };
          } else if (op.do === 'pixel') {
            const g = window.__pythonHarness.displayCanvas().getContext('2d');
            snaps[op.name] = Array.from(g.getImageData(op.x, op.y, 1, 1).data);
          }
        };
        if (op.delay) timers.push(setTimeout(run, op.delay));
        else run();
      }
    };
    const on = plan.on || {};
    if (plan.start) fire(plan.start);
    const unsub = client.subscribe({
      stdout: (t) => {
        out += t;
        for (const marker of Object.keys(on)) {
          if (!fired.has(marker) && out.includes(marker)) {
            fired.add(marker);
            marks[marker] = performance.now();
            fire(on[marker]);
          }
        }
      },
      stderr: (t) => {
        err += t;
      },
    });
    try {
      const res = await client.run(code, plan.allowUnconfirmed ? { allowUnconfirmed: true } : {});
      const endAt = performance.now();
      if (stopPromise) await stopPromise;
      await Promise.all(pushes); // a check's input never spills into the next one
      return { res, out, err, marks, snaps, stopMs: stopAt > 0 ? endAt - stopAt : -1 };
    } finally {
      for (const t of timers) clearTimeout(t);
      unsub();
    }
  };
}

export async function openDisplayHarness(browser, primaryOrigin) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
  await waitHarnessReady(page, { expectIsolated: true });
  await page.evaluate(async () => {
    const h = window.__pythonHarness;
    const client = h.createClient();
    const renderer = h.createDisplayRenderer(client);
    const dropped = [];
    client.subscribe({ droppedMessage: (r) => dropped.push(r) });
    window.__disp = { client, renderer, dropped };
    await client.start();
  });
  await page.evaluate(installRunner);
  return { ctx, page, pageErrors };
}

const PRE = 'import vdisplay as vd, numpy as np, json, time\n';

export async function runDisplayChecks(browserName, browser, { primaryOrigin, record }) {
  const name = (s) => `Display: ${s}`;
  // A check returns true, a failure string, or { note } (passed, with numbers to print).
  const check = (label, fn) =>
    record(browserName, name(label), async () => {
      const r = await fn();
      if (r && typeof r === 'object' && 'note' in r) {
        console.log(`    ${browserName}: ${r.note}`);
        return true;
      }
      return r;
    });
  const metrics = {};
  const { ctx, page, pageErrors } = await openDisplayHarness(browser, primaryOrigin);
  const run = (code, plan) => page.evaluate(([c, p]) => window.__dispRun(c, p), [PRE + code, plan]);
  const fail = (r, what) => {
    if (!r.res?.ok) return `${what}: run failed ${JSON.stringify(r.res?.error?.formatted || r.res).slice(0, 400)} ${r.err.slice(0, 200)}`;
    return null;
  };

  try {
    await check('pixels reach the canvas (colours, orientation, info)', async () => {
      const r = await run(
        `d = vd.Display(64, 48, title="Fill")
px = d.pixels
for i in range(30):
    px[..., 0] = i * 8
    px[..., 2] = 255 - i * 8
    d.present()
    d.wait_frame()
px[:, :32] = (200, 30, 40, 255)
px[:, 32:] = (10, 220, 90, 255)
px[40, 5] = (1, 2, 3, 255)
d.present()
for _ in range(6):
    d.wait_frame()
print("FILL_DONE", d.size, px.shape, px.dtype)
`,
      );
      const bad = fail(r, 'fill');
      if (bad) return bad;
      if (!r.out.includes('FILL_DONE (64, 48) (48, 64, 4) uint8')) return `unexpected output ${r.out}`;
      const got = await page.evaluate(() => {
        const c = window.__pythonHarness.displayCanvas();
        const g = c.getContext('2d');
        const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
        const s = window.__disp.renderer.stats();
        return { w: c.width, h: c.height, a: at(5, 5), b: at(50, 5), c: at(5, 40), info: window.__disp.renderer.info, drawn: s.framesDrawn };
      });
      const eq = (a, b) => a.join() === b.join();
      if (got.w !== 64 || got.h !== 48) return `canvas ${got.w}x${got.h}`;
      if (!eq(got.a, [200, 30, 40, 255]) || !eq(got.b, [10, 220, 90, 255]) || !eq(got.c, [1, 2, 3, 255])) {
        return `pixels ${JSON.stringify(got)}`;
      }
      if (got.info.title !== 'Fill' || got.info.scale !== 'fit' || !got.info.open) return `info ${JSON.stringify(got.info)}`;
      if (got.drawn < 10) return `only ${got.drawn} frames drawn`;
      return true;
    });

    await check('screenshot() is a PNG of the frame', async () => {
      const s = await page.evaluate(async () => {
        const blob = await window.__disp.renderer.screenshot();
        if (!blob) return null;
        const b = new Uint8Array(await blob.arrayBuffer());
        const dv = new DataView(b.buffer);
        return { type: blob.type, sig: Array.from(b.slice(0, 4)), w: dv.getUint32(16), h: dv.getUint32(20) };
      });
      if (!s) return 'no blob';
      if (s.type !== 'image/png' || s.sig.join() !== '137,80,78,71' || s.w !== 64 || s.h !== 48) return JSON.stringify(s);
      return true;
    });

    await check('wait_frame paces presents to the page frame rate', async () => {
      const r = await run(
        `d = vd.Display(640, 480, title="Paced")
px = d.pixels
d.wait_frame()
print("START", flush=True)
t0 = vd._now(); w0 = vd._host.waited_ms(); n = 0
while vd._now() - t0 < 2.0:
    px[..., 1] = n & 255
    d.present()
    d.wait_frame()
    n += 1
el = vd._now() - t0
busy = 1 - (vd._host.waited_ms() - w0) / 1000 / el
print("END", json.dumps({"fps": n / el, "busy": busy}), flush=True)
`,
        { on: { START: [{ do: 'reset', name: 's' }], END: [{ do: 'stats', name: 'e' }] } },
      );
      const bad = fail(r, 'paced');
      if (bad) return bad;
      const py = JSON.parse(r.out.split('END ')[1]);
      const dur = (r.snaps.e.at - r.snaps.sAt) / 1000;
      const raf = r.snaps.e.rafTicks / dur;
      const drawn = r.snaps.e.framesDrawn / dur;
      metrics.pacedFps = py.fps;
      metrics.rafHz = raf;
      metrics.pacedDrawn = drawn;
      metrics.pacedBusy = py.busy;
      const note = `py ${f1(py.fps)} fps, rAF ${f1(raf)} Hz, drawn ${f1(drawn)}/s, busy ${f2(py.busy)}`;
      if (py.fps < 20 || py.fps > raf * 1.15 + 5) return `paced fps out of range: ${note}`;
      if (browserName !== 'webkit' && py.fps < raf * 0.8) return `paced fps below rAF: ${note}`;
      if (drawn < Math.min(py.fps, raf) * 0.5) return `too few frames drawn: ${note}`;
      return { note };
    });

    await check('busy present() loop keeps the page drawing', async () => {
      const r = await run(
        `d = vd.Display(640, 480, title="Busy")
px = d.pixels
d.wait_frame()
print("START", flush=True)
t0 = vd._now(); n = 0
while vd._now() - t0 < 2.0:
    px[..., 0] = n & 255
    d.present()
    n += 1
print("END", n / (vd._now() - t0), flush=True)
`,
        { on: { START: [{ do: 'reset', name: 's' }], END: [{ do: 'stats', name: 'e' }] } },
      );
      const bad = fail(r, 'busy');
      if (bad) return bad;
      const pyFps = Number(r.out.split('END ')[1]);
      const dur = (r.snaps.e.at - r.snaps.sAt) / 1000;
      const drawn = r.snaps.e.framesDrawn / dur;
      const gap = r.snaps.e.maxRafGapMs;
      const drawMs = r.snaps.e.drawMs / Math.max(1, r.snaps.e.framesDrawn);
      metrics.busyPyFps = pyFps;
      metrics.busyDrawn = drawn;
      metrics.busyMaxGap = gap;
      metrics.pageCostMs = drawMs;
      const note = `py ${f1(pyFps)} fps, drawn ${f1(drawn)}/s, max rAF gap ${f1(gap)} ms, page ${f2(drawMs)} ms/frame`;
      if (drawn < 20 || gap > 150) return `page not responsive: ${note}`;
      return { note };
    });

    const stopTrials = async (label, code, trials, plan) => {
      const times = [];
      const others = [];
      for (let i = 0; i < trials; i += 1) {
        const delay = 20 + ((i * 37) % 100);
        const r = await run(code, {
          ...plan,
          on: { ...(plan?.on || {}), LOOP_READY: [...(plan?.on?.LOOP_READY || []), { do: 'stop', delay }] },
        });
        if (r.res?.forceStopped) return { error: `${label} trial ${i + 1} needed Force Stop` };
        const m = /RESULT (\w+)/.exec(r.out);
        if (!m) return { error: `${label} trial ${i + 1}: no RESULT (${r.out.slice(-200)} ${r.err.slice(-300)})` };
        if (m[1] !== 'KI') others.push(r.out.split('RESULT ')[1].trim());
        times.push(r.stopMs);
      }
      return { times, others };
    };
    const loopCode = (body, setup = '') => `${setup}d = vd.Display(320, 240, title="Stop")
px = d.pixels
n = 0
print("LOOP_READY", flush=True)
try:
    while True:
${body}
except KeyboardInterrupt:
    print("RESULT KI")
except BaseException as e:
    print("RESULT", type(e).__name__, e)
`;
    const judge = (label, t, key) => {
      if (t.error) return t.error;
      metrics[key] = { median: median(t.times), max: Math.max(...t.times) };
      const note = `n=${t.times.length}, median ${f1(median(t.times))} ms, max ${f1(Math.max(...t.times))} ms, other ${t.others.length}`;
      if (t.others.length > 0) return `${label}: non-KeyboardInterrupt ${JSON.stringify(t.others.slice(0, 3))} (${note})`;
      if (Math.max(...t.times) > 300) return `${label}: slow Stop (${note})`;
      return { note };
    };

    await check('Stop in a busy present() loop: KeyboardInterrupt, 20 trials', async () => {
      const t = await stopTrials('busy', loopCode('        px[..., 0] = n & 255\n        d.present()\n        n += 1'), 20);
      return judge('busy', t, 'stopBusy');
    });

    await check('Stop on the buffer fallback: ConversionError becomes KeyboardInterrupt, 10 trials', async () => {
      const t = await stopTrials(
        'fallback',
        loopCode('        px[..., 0] = n & 255\n        d.present()\n        d.poll()\n        n += 1', 'vd._HEAP_OK = False\n'),
        10,
      );
      await run('vd._HEAP_OK = bool(vd._host.heap_ok)\n');
      return judge('fallback', t, 'stopFallback');
    });

    await check('Stop while blocked in wait_frame (hidden): KeyboardInterrupt, 5 trials', async () => {
      await page.evaluate(() => window.__disp.renderer.setHidden(true));
      try {
        const t = await stopTrials('wait_frame', loopCode('        d.wait_frame()'), 5);
        return judge('wait_frame', t, 'stopWaitFrame');
      } finally {
        await page.evaluate(() => window.__disp.renderer.setHidden(false));
      }
    });

    await check('Stop while blocked in wait_event: KeyboardInterrupt, 5 trials', async () => {
      const t = await stopTrials('wait_event', loopCode('        d.wait_event()'), 5);
      return judge('wait_event', t, 'stopWaitEvent');
    });

    await check('input reaches wait_event with every field (latency median)', async () => {
      const list = [
        { k: 'pointer', kind: 'move', x: 160, y: 120, buttons: 0 },
        { k: 'wait', ms: 5 },
        { k: 'pointer', kind: 'down', x: 10.6, y: 20.2, button: 0, buttons: 1, mods: 1 },
        { k: 'wait', ms: 5 },
        { k: 'pointer', kind: 'up', x: 10, y: 20, button: 2, buttons: 0 },
        { k: 'wheel', x: 100, y: 50, dx: 0, dy: -120, mods: 2 },
        { k: 'key', kind: 'down', key: 'a', code: 'KeyA' },
        { k: 'key', kind: 'down', key: 'A', code: 'KeyA', mods: 1, repeat: true },
        { k: 'key', kind: 'down', key: 'c', code: 'KeyC', mods: 2 },
        { k: 'key', kind: 'down', key: 'ArrowLeft', code: 'ArrowLeft' },
        { k: 'key', kind: 'up', key: 'é', code: 'Quote' },
      ];
      for (let i = 0; i < 20; i += 1) list.push({ k: 'wait', ms: 12 }, { k: 'pointer', kind: 'move', x: i * 10, y: 5 });
      const r = await run(
        `d = vd.Display(640, 480, title="Input")
print("READY", flush=True)
evs = []; lat = []
while len(evs) < 29:
    ev = d.wait_event(3.0)
    if ev is None:
        break
    lat.append(vd._now() * 1000 - ev.t * 1000)
    evs.append([ev.type, ev.x, ev.y, ev.button, ev.buttons, ev.key, ev.code, ev.text, ev.mods, round(ev.dx), round(ev.dy), ev.repeat])
print("EVS", json.dumps({"evs": evs, "lat": lat}))
`,
        { on: { READY: [{ do: 'push', list }] } },
      );
      const bad = fail(r, 'input');
      if (bad) return bad;
      const { evs, lat } = JSON.parse(r.out.split('EVS ')[1]);
      if (evs.length !== 29) return `got ${evs.length} events`;
      const want = [
        ['pointermove', 320, 240, 0, 0, '', '', '', 0, 0, 0, false],
        ['pointerdown', 21, 40, 0, 1, '', '', '', 1, 0, 0, false],
        ['pointerup', 20, 40, 2, 0, '', '', '', 0, 0, 0, false],
        ['wheel', 200, 100, 0, 0, '', '', '', 2, 0, -120, false],
        ['keydown', 0, 0, 0, 0, 'a', 'KeyA', 'a', 0, 0, 0, false],
        ['keydown', 0, 0, 0, 0, 'A', 'KeyA', 'A', 1, 0, 0, true],
        ['keydown', 0, 0, 0, 0, 'c', 'KeyC', '', 2, 0, 0, false],
        ['keydown', 0, 0, 0, 0, 'ArrowLeft', 'ArrowLeft', '', 0, 0, 0, false],
        ['keyup', 0, 0, 0, 0, 'é', 'Quote', '', 0, 0, 0, false],
      ];
      for (let i = 0; i < want.length; i += 1) {
        if (JSON.stringify(evs[i]) !== JSON.stringify(want[i])) return `event ${i}: ${JSON.stringify(evs[i])} != ${JSON.stringify(want[i])}`;
      }
      const moveLat = lat.slice(want.length);
      metrics.inputWaitEventMs = median(moveLat);
      const note = `wait_event median ${f2(median(moveLat))} ms, max ${f2(Math.max(...moveLat))} ms`;
      if (median(moveLat) > 20) return `slow input: ${note}`;
      return { note };
    });

    await check('input in a wait_frame-paced loop (latency median)', async () => {
      const r = await run(
        `d = vd.Display(320, 240, title="Paced input")
print("READY", flush=True)
lat = []; t0 = vd._now()
while vd._now() - t0 < 1.5 and len(lat) < 60:
    d.wait_frame()
    for ev in d.poll():
        lat.append(vd._now() * 1000 - ev.t * 1000)
print("LAT", json.dumps(lat))
`,
        { on: { READY: [{ do: 'push', list: [{ k: 'moves', n: 60, x: 5, y: 5, every: 15 }] }] } },
      );
      const bad = fail(r, 'paced input');
      if (bad) return bad;
      const lat = JSON.parse(r.out.split('LAT ')[1]);
      if (lat.length < 30) return `only ${lat.length} events`;
      metrics.inputPacedMs = median(lat);
      const note = `paced median ${f2(median(lat))} ms, max ${f2(Math.max(...lat))} ms`;
      if (median(lat) > 34) return `slow paced input: ${note}`;
      return { note };
    });

    await check('full events ring drops and counts, moves are merged', async () => {
      const keys = [];
      for (let i = 0; i < 300; i += 1) keys.push({ k: 'key', kind: 'down', key: 'x', code: 'KeyX' });
      const r = await run(
        `d = vd.Display(640, 480, title="Ring")
print("READY", flush=True)
time.sleep(0.6)
a = d.poll()
print("READY2", flush=True)
time.sleep(0.6)
b = d.poll()
time.sleep(0.15)
b += d.poll()
print("RING", len(a), sum(1 for e in b if e.type == "pointermove"), b[-1].x if b else -1)
`,
        {
          on: {
            READY: [{ do: 'push', list: keys }],
            READY2: [{ do: 'push', list: [{ k: 'moves', n: 300, x: 0, y: 1 }] }, { do: 'stats', name: 'k', delay: 50 }],
          },
        },
      );
      const bad = fail(r, 'ring');
      if (bad) return bad;
      const m = /RING (\d+) (\d+) (-?\d+)/.exec(r.out);
      if (!m) return `no RING line: ${r.out}`;
      const dropped = r.snaps.k.eventsDropped;
      // 256 keys fit, 44 dropped; 256 moves fit, the rest merge into one written at the next frame.
      if (Number(m[1]) !== 256 || dropped < 44) return `keys ${m[1]}, dropped ${dropped}`;
      if (Number(m[2]) !== 257 || Number(m[3]) !== 2 * (299 % 50)) return `moves ${m[2]}, last x ${m[3]}; ${JSON.stringify(r.marks)} ${JSON.stringify(r.snaps)}`;
      return { note: `dropped ${dropped}, merged ${r.snaps.k.eventsCoalesced}` };
    });

    await check('hidden: wait_frame blocks, present() drops to ~4 fps', async () => {
      await page.evaluate(() => window.__disp.renderer.setHidden(true));
      let r;
      try {
        r = await run(
          `d = vd.Display(320, 240, title="Hidden")
for _ in range(200):
    if vd._host.hidden():
        break
    time.sleep(0.01)
print("HIDDEN_READY", flush=True)
w0 = vd._host.waited_ms(); t0 = vd._now(); n = 0
while vd._now() - t0 < 2.0:
    d.present()
    n += 1
el = vd._now() - t0
busy1 = 1 - (vd._host.waited_ms() - w0) / 1000 / el
print("PHASE2", flush=True)
w0 = vd._host.waited_ms(); t0 = vd._now()
d.wait_frame()
blocked = vd._now() - t0
busy2 = 1 - (vd._host.waited_ms() - w0) / 1000 / blocked
print("HID", json.dumps({"fps": n / el, "busy1": busy1, "blocked": blocked, "busy2": busy2}))
`,
          { on: { PHASE2: [{ do: 'hide', hidden: false, delay: 1000 }] } },
        );
      } finally {
        await page.evaluate(() => window.__disp.renderer.setHidden(false));
      }
      const bad = fail(r, 'hidden');
      if (bad) return bad;
      const h = JSON.parse(r.out.split('HID ')[1]);
      metrics.hidden = h;
      const note = `present ${f2(h.fps)} fps busy ${f2(h.busy1)}, wait_frame blocked ${f2(h.blocked)} s busy ${f2(h.busy2)}`;
      if (h.fps < 2.5 || h.fps > 6 || h.busy1 > 0.2) return `hidden present throttle: ${note}`;
      if (h.blocked < 0.8 || h.blocked > 2 || h.busy2 > 0.1) return `hidden wait_frame: ${note}`;
      return { note };
    });

    await check('oversize Display is clamped to 1920x1080, bad sizes refused, title cleaned', async () => {
      const r = await run(
        `d = vd.Display(5000, 4000, title="Big\\u202e" + "x" * 300)
print("SIZE", d.size, d.pixels.shape)
for bad in [(0, 10), (10, -1), ("a", 3)]:
    try:
        vd.Display(*bad)
        print("ACCEPTED", bad)
    except vd.DisplayError:
        pass
try:
    vd.Display(10, 10, scale="huge")
    print("ACCEPTED scale")
except vd.DisplayError:
    pass
`,
      );
      const bad = fail(r, 'oversize');
      if (bad) return bad;
      if (!r.out.includes('SIZE (1920, 1080) (1080, 1920, 4)') || r.out.includes('ACCEPTED')) return r.out;
      const info = await page.evaluate(() => {
        const c = window.__pythonHarness.displayCanvas();
        return { ...window.__disp.renderer.info, cw: c.width, ch: c.height };
      });
      if (info.width !== 1920 || info.height !== 1080 || info.cw !== 1920 || info.ch !== 1080) return JSON.stringify(info);
      if (info.title.length !== 200 || info.title.includes('\u202e') || !info.title.startsWith('Bigx')) return `title ${info.title.slice(0, 20)}`;
      return true;
    });

    await check('forged display.* messages are dropped; validator clamps', async () => {
      const before = await page.evaluate(() => ({ n: window.__disp.dropped.length, id: window.__disp.renderer.info?.id }));
      const r = await run(
        `import js
from pyodide.ffi import to_js
def post(o):
    js.postMessage(to_js(o, dict_converter=js.Object.fromEntries))
ev = js.SharedArrayBuffer.new(256 * 96)
post({"type": "display.open", "id": 99, "width": "big", "height": 10, "title": "x", "scale": "fit", "fbSab": js.SharedArrayBuffer.new(120), "eventsSab": ev})
post({"type": "display.open", "id": 98, "width": 5000, "height": 4000, "title": "x", "scale": "fit", "fbSab": js.SharedArrayBuffer.new(16), "eventsSab": ev})
post({"type": "display.open", "id": 97, "width": 10, "height": 10, "title": "x", "scale": "fit", "fbSab": js.ArrayBuffer.new(1200), "eventsSab": ev})
post({"type": "display.open", "id": 96, "width": 10, "height": 10, "title": 5, "scale": "fit", "fbSab": js.SharedArrayBuffer.new(1200), "eventsSab": ev})
post({"type": "display.close", "id": -1})
post({"type": "display.batch", "id": 1, "buf": "x"})
print("POSTED")
`,
      );
      const bad = fail(r, 'forged');
      if (bad) return bad;
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => {
        const { validateWorkerMessage } = window.__pythonHarness;
        const fb = new SharedArrayBuffer(3 * 1920 * 1080 * 4);
        const ev = new SharedArrayBuffer(256 * 96);
        const cmd = new SharedArrayBuffer(3 * 256 * 1024);
        const v = validateWorkerMessage({ type: 'display.open', id: 5, width: 5000, height: 4000.7, title: 'a\u0007b\u202e', scale: 'pixel', fbSab: fb, eventsSab: ev, cmdSab: cmd });
        const s = validateWorkerMessage({ type: 'display.open', id: 5, width: 10, height: 10, title: 't', scale: 9, fbSab: new SharedArrayBuffer(1200), eventsSab: ev, cmdSab: cmd });
        const noCmd = validateWorkerMessage({ type: 'display.open', id: 5, width: 10, height: 10, title: 't', scale: 'fit', fbSab: new SharedArrayBuffer(1200), eventsSab: ev });
        const badSeq = validateWorkerMessage({ type: 'display.batch', id: 5, seq: 0, buf: new ArrayBuffer(8) });
        return {
          n: window.__disp.dropped.length,
          id: window.__disp.renderer.info?.id,
          v: v.ok ? { w: v.message.width, h: v.message.height, t: v.message.title, s: v.message.scale } : v.reason,
          scaleOk: s.ok,
          noCmdOk: noCmd.ok,
          badSeqOk: badSeq.ok,
        };
      });
      if (after.n - before.n !== 6) return `dropped ${after.n - before.n} of 6`;
      if (after.id !== before.id) return 'a forged display.open replaced the display';
      if (JSON.stringify(after.v) !== JSON.stringify({ w: 1920, h: 1080, t: 'ab', s: 'pixel' })) return `validator ${JSON.stringify(after.v)}`;
      if (after.scaleOk) return 'scale 9 accepted';
      if (after.noCmdOk || after.badSeqOk) return 'display.open without cmdSab or display.batch with seq 0 accepted';
      return true;
    });

    await check('one window: a new Display closes the old; close(); Clock; canvas', async () => {
      const r = await run(
        `d1 = vd.Display(10, 10, title="One")
d2 = vd.Display(20, 12, title="Two")
print("CLOSED", d1.closed, d2.closed)
try:
    d1.present()
    print("OLD PRESENTED")
except vd.DisplayError:
    print("OLD REFUSED")
if isinstance(d2.canvas, vd.Canvas) and d2.canvas is d2.canvas:
    print("CANVAS OK")
c = vd.Clock()
for _ in range(16):
    c.tick(30)
print("FPS", round(c.get_fps()))
d2.present()
print("INFO2", flush=True)
time.sleep(0.1)
d2.close()
print("AFTER", d2.closed)
`,
        { on: { INFO2: [{ do: 'stats', name: 'i' }] } },
      );
      const bad = fail(r, 'one window');
      if (bad) return bad;
      if (!r.out.includes('CLOSED True False') || !r.out.includes('OLD REFUSED') || !r.out.includes('CANVAS OK') || !r.out.includes('AFTER True')) {
        return r.out;
      }
      const fps = Number(/FPS (\d+)/.exec(r.out)?.[1]);
      if (!(fps >= 27 && fps <= 33)) return `Clock.tick(30) gave ${fps} fps`;
      await page.waitForTimeout(50);
      const info = await page.evaluate(() => window.__disp.renderer.info);
      if (info.width !== 20 || info.height !== 12 || info.title !== 'Two' || info.open) return JSON.stringify(info);
      return { note: `Clock ${fps} fps` };
    });

    await check('no page errors on /python/harness', async () =>
      pageErrors.length === 0 ? true : pageErrors.slice(0, 3).join(' | '),
    );
  } finally {
    await page.evaluate(() => {
      window.__disp?.renderer.dispose();
      window.__disp?.client.dispose();
    }).catch(() => {});
    await ctx.close();
  }

  // Tier 2: no service worker, so no isolation, no SAB: Display() explains itself.
  const t2 = await browser.newContext();
  const t2Page = await t2.newPage();
  try {
    await t2Page.goto(`${primaryOrigin}/python/harness?nosw=1`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(t2Page, { expectIsolated: false });
    await check('Tier 2 (?nosw=1): Display() raises a clear DisplayError', async () => {
      const r = await t2Page.evaluate(async () => {
        const client = window.__pythonHarness.createClient();
        const ready = await client.start();
        let out = '';
        const unsub = client.subscribe({ stdout: (t) => { out += t; } });
        const res = await client.run(
          'import vdisplay as vd\ntry:\n    vd.Display(10, 10)\n    print("OPENED")\nexcept vd.DisplayError as e:\n    print("ERR", e)\n',
          { allowUnconfirmed: true },
        );
        unsub();
        client.dispose();
        return { tier: ready.tier, out, ok: res.ok };
      });
      if (r.tier === 1) return 'expected Tier 2 or 3 without the service worker';
      if (!r.ok || !r.out.includes(`ERR vdisplay needs Tier 1, but Python runs in Tier ${r.tier}`)) return JSON.stringify(r).slice(0, 400);
      return true;
    });
  } finally {
    await t2.close();
  }
  Object.assign(metrics, await runDisplayDrawChecks(browserName, browser, { primaryOrigin, record }));
  return metrics;
}
