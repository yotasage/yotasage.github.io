// Part B (8, continued): P7b display draw commands (PYTHON_PARTS=display) in Edge, Firefox and WebKit on
// /python/harness: every command draws where it should (pixels sampled on the harness canvas), frames
// start from the pixels or black and commands do not carry over, the colour table against the
// browser's own parser, malformed batches rejected without throwing (the canvas stays usable),
// 1,000-primitive frames, batches too large for a slot by display.batch, resize and close events,
// and the four display examples (frames, a paint drag, Stop within 300 ms as KeyboardInterrupt).
import { openDisplayHarness } from './display-checks.mjs';

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const near = (got, want, tol = 8) => got.length === 4 && want.every((w, i) => Math.abs(got[i] - w) <= tol);

const PRE = 'import vdisplay as vd, numpy as np, json, time\n';

/** In-page: malformed batches drawn straight by the renderer; each must stop with an error, never throw. */
function malformedBatches() {
  const { renderer } = window.__disp;
  const RED = 0xff0000ff;
  const enc = (parts) => {
    let n = 0;
    for (const [t, v] of parts) n += t === 'u16' ? 2 : t === 'bytes' ? v.length : 4;
    const out = new Uint8Array(n);
    const dv = new DataView(out.buffer);
    let o = 0;
    for (const [t, v] of parts) {
      if (t === 'u32') dv.setUint32(o, v >>> 0, true);
      else if (t === 'f32') dv.setFloat32(o, v, true);
      else if (t === 'u16') dv.setUint16(o, v, true);
      else out.set(v, o);
      o += t === 'u16' ? 2 : t === 'bytes' ? v.length : 4;
    }
    return out;
  };
  const good = [['u32', 2], ['f32', 0], ['f32', 0], ['f32', 4], ['f32', 4], ['u32', RED]];
  const rep = (part, k) => Array.from({ length: k }, () => part).flat();
  const cases = {
    'truncated header': [...good, ['u16', 1]],
    'unknown opcode': [...good, ['u32', 99]],
    'opcode 0': [...good, ['u32', 0]],
    NaN: [...good, ['u32', 2], ['f32', NaN], ['f32', 0], ['f32', 1], ['f32', 1], ['u32', RED]],
    'infinite line width': [...good, ['u32', 4], ['f32', 0], ['f32', 0], ['f32', 9], ['f32', 9], ['f32', Infinity], ['u32', RED]],
    'line width over cap': [...good, ['u32', 3], ['f32', 0], ['f32', 0], ['f32', 9], ['f32', 9], ['f32', 5000], ['u32', RED]],
    'record past end': [...good, ['u32', 2], ['f32', 0], ['f32', 0]],
    'too many points': [...good, ['u32', 5], ['u32', 70000], ['f32', 1], ['u32', RED]],
    'points past end': [...good, ['u32', 5], ['u32', 10], ['f32', 1], ['u32', RED], ['f32', 1], ['f32', 2]],
    'non-finite point': [...good, ['u32', 5], ['u32', 2], ['f32', 1], ['u32', RED], ['f32', 1], ['f32', 2], ['f32', Infinity], ['f32', 2]],
    'text over cap': [...good, ['u32', 9 | (5000 << 16)], ['f32', 0], ['f32', 0], ['f32', 12], ['u32', RED]],
    'text past end': [...good, ['u32', 9 | (40 << 16)], ['f32', 0], ['f32', 0], ['f32', 12], ['u32', RED], ['bytes', new Uint8Array(8)]],
    'unknown font': [...good, ['u32', 9 | (3 << 8) | (4 << 16)], ['f32', 0], ['f32', 0], ['f32', 12], ['u32', RED], ['bytes', new Uint8Array([65, 66, 67, 68])]],
    'text size 0': [...good, ['u32', 9 | (4 << 16)], ['f32', 0], ['f32', 0], ['f32', 0], ['u32', RED], ['bytes', new Uint8Array([65, 66, 67, 68])]],
    'image too wide': [...good, ['u32', 10], ['f32', 0], ['f32', 0], ['f32', 1], ['f32', 1], ['u16', 4000], ['u16', 1]],
    'image past end': [...good, ['u32', 10], ['f32', 0], ['f32', 0], ['f32', 1], ['f32', 1], ['u16', 10], ['u16', 10]],
    'restore without save': [...good, ['u32', 12]],
    'save depth 65': [...good, ...rep([['u32', 11], ['u32', 13], ['f32', 1], ['f32', 1]], 65)],
    'negative radius': [...good, ['u32', 6 | (2 << 8)], ['f32', 5], ['f32', 5], ['f32', -1], ['f32', 1], ['u32', RED]],
    'alpha 2': [...good, ['u32', 17], ['f32', 2]],
  };
  const results = {};
  for (const [name, parts] of Object.entries(cases)) {
    try {
      const r = renderer.drawRawBatch(enc(parts));
      results[name] = { records: r.records, error: r.error };
    } catch (e) {
      results[name] = { threw: String(e) };
    }
  }
  // Shared memory and an oversized batch are refused as a whole.
  const { drawBatch, createDrawScratch } = window.__dispCommands || {};
  const ctx = window.__pythonHarness.displayCanvas().getContext('2d');
  const sab = new Uint8Array(new SharedArrayBuffer(24));
  sab.set(enc(good));
  try {
    results['shared memory'] = drawBatch ? drawBatch(ctx, sab, createDrawScratch()) : { records: 0, error: 'skipped' };
  } catch (e) {
    results['shared memory'] = { threw: String(e) };
  }
  try {
    const r = renderer.drawRawBatch(new Uint8Array(4 * 1024 * 1024 + 4));
    results['over 4 MiB'] = { records: r.records, error: r.error };
  } catch (e) {
    results['over 4 MiB'] = { threw: String(e) };
  }
  // The canvas is still usable and its state not leaked: a good batch draws at the identity transform.
  const t = ctx.getTransform();
  const ident = t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0 && ctx.globalAlpha === 1;
  const blue = renderer.drawRawBatch(enc([['u32', 2], ['f32', 0], ['f32', 0], ['f32', 20], ['f32', 20], ['u32', 0xffff0000]]));
  const px = Array.from(ctx.getImageData(10, 10, 1, 1).data);
  return { results, ident, blue, px };
}

export async function runDisplayDrawChecks(browserName, browser, { primaryOrigin, record }) {
  const name = (s) => `Display draw: ${s}`;
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
  const run = (code, plan, raw = false) =>
    page.evaluate(([c, p]) => window.__dispRun(c, p), [raw ? code : PRE + code, plan || {}]);
  const fail = (r, what) => {
    if (!r.res?.ok) return `${what}: run failed ${JSON.stringify(r.res?.error?.formatted || r.res).slice(0, 400)} ${r.err.slice(0, 200)}`;
    return null;
  };
  const pixels = (pts) =>
    page.evaluate((list) => {
      const g = window.__pythonHarness.displayCanvas().getContext('2d');
      return list.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data));
    }, pts);
  const stats = () => page.evaluate(() => window.__disp.renderer.stats());

  try {
    await check('every command draws where it should; frames start from pixels or black', async () => {
      const r = await run(
        `d = vd.Display(200, 150, title="Draw")
g = d.canvas
g.fill_rect(10, 10, 40, 30, "red")
g.rect(60, 10, 40, 30, "lime", width=4)
g.line(110, 15, 190, 15, "#00f", width=6)
g.circle(30, 75, 15, "yellow")
g.circle(80, 75, 15, "cyan", fill=False, width=4)
g.polygon([(110, 60), (150, 60), (130, 95)], "magenta")
g.ellipse(170, 75, 20, 10, "orange")
g.arc(30, 125, 15, 0, 1.5707963, "white", fill=True)
g.text(60, 110, "Hi", size=24, color="white")
img = np.zeros((2, 2, 4), np.uint8)
img[0, 0] = (255, 0, 0, 255); img[0, 1] = (0, 255, 0, 255); img[1, 0] = (0, 0, 255, 255); img[1, 1] = (255, 255, 255, 255)
g.image(110, 105, img, width=20, height=20)
g.save(); g.translate(150, 105); g.rotate(0); g.scale(2); g.fill_rect(0, 0, 10, 10, (10, 20, 30)); g.restore()
g.save(); g.clip_rect(180, 130, 10, 10); g.fill_rect(170, 120, 30, 30, "white"); g.restore()
g.save(); g.alpha(0.5); g.fill_rect(0, 140, 10, 10, "white"); g.restore()
d.present()
for _ in range(4):
    d.wait_frame()
print("FRAME1", flush=True)
time.sleep(0.05)
d.pixels[...] = (0, 100, 0, 255)
g.fill_rect(0, 0, 10, 10, "red")
d.present()
for _ in range(4):
    d.wait_frame()
print("FRAME2", flush=True)
time.sleep(0.05)
d.present()
for _ in range(4):
    d.wait_frame()
print("FRAME3", flush=True)
time.sleep(0.05)
`,
        {
          on: {
            FRAME1: [
              ...[[20, 20], [61, 25], [80, 25], [150, 15], [30, 75], [30, 93], [80, 60], [80, 75], [130, 70], [170, 75], [170, 88], [37, 131], [23, 119], [114, 109], [126, 109], [114, 121], [126, 121], [165, 115], [172, 122], [185, 135], [175, 125], [5, 145], [195, 5]].map(
                ([x, y], i) => ({ do: 'pixel', name: `p${i}`, x, y }),
              ),
            ],
            FRAME2: [{ do: 'pixel', name: 'q0', x: 5, y: 5 }, { do: 'pixel', name: 'q1', x: 50, y: 50 }],
            FRAME3: [{ do: 'pixel', name: 'r0', x: 5, y: 5 }],
          },
        },
      );
      const bad = fail(r, 'draw');
      if (bad) return bad;
      const want = [
        ['fill_rect', [255, 0, 0, 255]],
        ['rect edge', [0, 255, 0, 255]],
        ['rect inside', [0, 0, 0, 255]],
        ['line', [0, 0, 255, 255]],
        ['circle', [255, 255, 0, 255]],
        ['outside circle', [0, 0, 0, 255]],
        ['ring', [0, 255, 255, 255]],
        ['inside ring', [0, 0, 0, 255]],
        ['polygon', [255, 0, 255, 255]],
        ['ellipse', [255, 165, 0, 255]],
        ['outside ellipse', [0, 0, 0, 255]],
        ['pie', [255, 255, 255, 255]],
        ['outside pie', [0, 0, 0, 255]],
        ['image red', [255, 0, 0, 255]],
        ['image green', [0, 255, 0, 255]],
        ['image blue', [0, 0, 255, 255]],
        ['image white', [255, 255, 255, 255]],
        ['translate+scale', [10, 20, 30, 255]],
        ['after restore', [0, 0, 0, 255]],
        ['clip inside', [255, 255, 255, 255]],
        ['clip outside', [0, 0, 0, 255]],
        ['alpha 0.5', [128, 128, 128, 255]],
        ['untouched black', [0, 0, 0, 255]],
      ];
      for (let i = 0; i < want.length; i += 1) {
        const got = r.snaps[`p${i}`];
        if (!got || !near(got, want[i][1], i === 21 ? 3 : 10)) return `${want[i][0]}: ${JSON.stringify(got)} != ${JSON.stringify(want[i][1])}`;
      }
      if (!near(r.snaps.q0, [255, 0, 0, 255]) || !near(r.snaps.q1, [0, 100, 0, 255])) return `frame 2 ${JSON.stringify([r.snaps.q0, r.snaps.q1])}`;
      if (!near(r.snaps.r0, [0, 100, 0, 255])) return `frame 3 kept the commands: ${JSON.stringify(r.snaps.r0)}`;
      const s = await stats();
      if (s.batchErrors !== 0) return `batch errors: ${s.lastBatchError}`;
      return true;
    });

    await check('text draws in every font, alignment and baseline', async () => {
      const r = await run(
        `d = vd.Display(240, 120, title="Text")
g = d.canvas
g.text(10, 10, "Sans", size=20, font="sans")
g.text(120, 40, "Serif", size=20, font="serif", align="center", baseline="middle")
g.text(230, 100, "Mono", size=20, font="mono", align="right", baseline="bottom")
g.text(10, 100, "æøå ✓", size=16, baseline="alphabetic")
d.present()
for _ in range(4):
    d.wait_frame()
print("TEXT", flush=True)
time.sleep(0.05)
`,
      );
      const bad = fail(r, 'text');
      if (bad) return bad;
      const counts = await page.evaluate(() => {
        const g = window.__pythonHarness.displayCanvas().getContext('2d');
        const lit = (x, y, w, h) => {
          const d = g.getImageData(x, y, w, h).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 128) n += 1;
          return n;
        };
        return { sans: lit(10, 10, 60, 24), serif: lit(90, 28, 60, 24), mono: lit(170, 76, 60, 24), utf8: lit(10, 84, 70, 18), empty: lit(100, 0, 20, 20) };
      });
      if (counts.sans < 20 || counts.serif < 20 || counts.mono < 20 || counts.utf8 < 20 || counts.empty !== 0) return JSON.stringify(counts);
      return { note: `lit pixels ${JSON.stringify(counts)}` };
    });

    await check('colour parsing: CSS names match the browser, hex and tuples, errors', async () => {
      const r = await run(
        `out = {"names": {n: vd.color(n) for n in vd._NAMED}}
cases = ["#abc", "#abcd", "#A1B2C3", "#a1b2c3d4", " Tomato ", (1, 2, 3), (1, 2, 3, 4.4), [255, 128, 0], np.array([9, 8, 7], np.uint8)]
out["ok"] = [vd.color(c) for c in cases]
errs = []
for c in ["#abcde", "nocolour", "#ggg", "#+fffff", "#ff_fff", (1, 2), (256, 0, 0), (-1, 0, 0), 5, None, "rgb(1,2,3)"]:
    try:
        vd.color(c)
        errs.append("ACCEPTED " + repr(c))
    except (ValueError, TypeError):
        errs.append("ok")
out["errs"] = errs
print("COL", json.dumps(out))
`,
      );
      const bad = fail(r, 'colours');
      if (bad) return bad;
      const out = JSON.parse(r.out.split('COL ')[1]);
      const names = Object.keys(out.names);
      if (names.length !== 149) return `${names.length} names (CSS Color 4 has 148 and transparent)`;
      const mismatch = await page.evaluate((table) => {
        const g = document.createElement('canvas').getContext('2d');
        const wrong = [];
        for (const [n, [r, gg, b, a]] of Object.entries(table)) {
          g.fillStyle = '#010203';
          g.fillStyle = n;
          const s = g.fillStyle;
          const hex = `#${[r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          const ok = a === 255 ? s === hex : /^rgba\(0, 0, 0, 0\)$/.test(s) && r + gg + b + a === 0;
          if (!ok) wrong.push(`${n}: ${s} vs ${JSON.stringify([r, gg, b, a])}`);
        }
        return wrong;
      }, out.names);
      if (mismatch.length) return mismatch.slice(0, 5).join('; ');
      const want = [[170, 187, 204, 255], [170, 187, 204, 221], [161, 178, 195, 255], [161, 178, 195, 212], [255, 99, 71, 255], [1, 2, 3, 255], [1, 2, 3, 4], [255, 128, 0, 255], [9, 8, 7, 255]];
      if (JSON.stringify(out.ok) !== JSON.stringify(want)) return `cases ${JSON.stringify(out.ok)}`;
      if (out.errs.some((e) => e !== 'ok')) return out.errs.filter((e) => e !== 'ok').join(', ');
      return { note: `${names.length} names match the browser` };
    });

    await check('Python refuses bad arguments with clear errors', async () => {
      const r = await run(
        `d = vd.Display(50, 50)
g = d.canvas
bad = []
tests = [
    lambda: g.fill_rect(0, 0, float("nan"), 1),
    lambda: g.line(0, 0, float("inf"), 1),
    lambda: g.circle(1, 1, -2),
    lambda: g.ellipse(1, 1, 2, -1),
    lambda: g.text(0, 0, "x" * 5000),
    lambda: g.text(0, 0, "x", font="Comic Sans"),
    lambda: g.text(0, 0, "x", size=0),
    lambda: g.text(0, 0, "x", align="justify"),
    lambda: g.polyline([(0, 0), (1, float("nan"))]),
    lambda: g.polyline([1, 2, 3]),
    lambda: g.polyline(np.zeros((70000, 2))),
    lambda: g.image(0, 0, np.zeros((4, 4, 4), np.float32)),
    lambda: g.image(0, 0, np.zeros((4, 4, 5), np.uint8)),
    lambda: g.image(0, 0, np.zeros((1, 2000, 4), np.uint8)),
    lambda: g.alpha(1.5),
    lambda: g.line_width(-1),
    lambda: g.restore(),
]
for i, t in enumerate(tests):
    try:
        t()
        bad.append(i)
    except (ValueError, TypeError, vd.DisplayError):
        pass
for _ in range(64):
    g.save()
try:
    g.save()
    bad.append("depth")
except vd.DisplayError:
    pass
print("BAD", bad, g._off == 64 * 4)
`,
      );
      const err = fail(r, 'arguments');
      if (err) return err;
      if (!r.out.includes('BAD [] True')) return r.out.slice(0, 300);
      return true;
    });

    await check('malformed batches stop at the first bad record without throwing; canvas stays usable', async () => {
      await page.evaluate(() => {
        window.__dispCommands = window.__pythonHarness.displayCommands;
      });
      const m = await page.evaluate(malformedBatches);
      const problems = [];
      for (const [k, v] of Object.entries(m.results)) {
        if (v.threw) problems.push(`${k} threw ${v.threw}`);
        else if (!v.error) problems.push(`${k} accepted`);
        else if (k !== 'shared memory' && k !== 'over 4 MiB' && v.records < 1) problems.push(`${k}: good prefix not drawn`);
      }
      if (m.results['save depth 65'] && m.results['save depth 65'].records !== 1 + 64 * 2) problems.push(`save depth records ${m.results['save depth 65'].records}`);
      if (problems.length) return problems.slice(0, 4).join('; ');
      if (!m.ident) return 'canvas state leaked after a bad batch';
      if (m.blue.error || !near(m.px, [0, 0, 255, 255])) return `good batch after bad ones: ${JSON.stringify(m)}`;
      // Forged display.batch messages from the program: dropped by the validator or ignored when no frame waits.
      const r = await run(
        `import js
from pyodide.ffi import to_js
d = vd.Display(40, 30, title="Forged")
def post(o):
    js.postMessage(to_js(o, dict_converter=js.Object.fromEntries))
post({"type": "display.batch", "id": d._id, "seq": 1, "buf": js.ArrayBuffer.new(64)})
post({"type": "display.batch", "id": d._id, "seq": 2, "buf": js.Uint8Array.new(8)})
post({"type": "display.batch", "id": d._id, "seq": 3, "buf": js.ArrayBuffer.new(5 * 1024 * 1024)})
d.canvas.fill_rect(0, 0, 40, 30, "gold")
d.present()
for _ in range(4):
    d.wait_frame()
print("FORGED", flush=True)
time.sleep(0.05)
`,
        { on: { FORGED: [{ do: 'pixel', name: 'g', x: 20, y: 15 }] } },
      );
      const bad = fail(r, 'forged batch');
      if (bad) return bad;
      if (!near(r.snaps.g, [255, 215, 0, 255])) return `frame after forged batches ${JSON.stringify(r.snaps.g)}`;
      if (pageErrors.length) return pageErrors.slice(0, 2).join(' | ');
      return { note: `${Object.keys(m.results).length} malformed batches refused` };
    });

    await check('1,000 primitives a frame (Clock.tick(60) paced)', async () => {
      const r = await run(
        `d = vd.Display(640, 480, title="1000")
g = d.canvas
clock = vd.Clock()
cols = ["tomato", "gold", "deepskyblue", "white"]
d.wait_frame()
print("START", flush=True)
t0 = vd._now(); n = 0; build = 0.0
while vd._now() - t0 < 2.5:
    b0 = vd._now()
    g.clear("black")
    for i in range(250):
        x = (i * 37 + n * 3) % 600
        y = (i * 53) % 440
        g.fill_rect(x, y, 12, 8, cols[i & 3])
        g.line(x, y, x + 20, y + 15, "white")
        g.circle(x + 5, y + 20, 6, cols[(i + 1) & 3])
        g.text(x, y + 28, "1234", size=10, color="white")
    build += vd._now() - b0
    d.present()
    clock.tick(60)
    n += 1
el = vd._now() - t0
print("END", json.dumps({"fps": n / el, "build_ms": build / n * 1000}), flush=True)
`,
        { on: { START: [{ do: 'reset', name: 's' }], END: [{ do: 'stats', name: 'e' }] } },
      );
      const bad = fail(r, '1000');
      if (bad) return bad;
      const py = JSON.parse(r.out.split('END ')[1]);
      const e = r.snaps.e;
      const dur = (e.at - r.snaps.sAt) / 1000;
      const drawn = e.framesDrawn / dur;
      const perFrame = e.commandsDrawn / Math.max(1, e.framesDrawn);
      const drawMs = e.drawMs / Math.max(1, e.framesDrawn);
      metrics.prim1000 = { fps: py.fps, drawn, buildMs: py.build_ms, drawMs };
      const note = `py ${f1(py.fps)} fps (build ${f2(py.build_ms)} ms), drawn ${f1(drawn)}/s, ${f1(perFrame)} records/frame, page ${f2(drawMs)} ms/frame, max rAF gap ${f1(e.maxRafGapMs)} ms`;
      if (e.batchErrors) return `batch errors ${e.lastBatchError}: ${note}`;
      if (Math.round(perFrame) !== 1001) return `records per frame: ${note}`;
      if (browserName === 'webkit' ? drawn < 10 : py.fps < 50 || drawn < 50) return `too slow: ${note}`;
      return { note };
    });

    await check('batches too large for a slot go by display.batch, at most one in flight', async () => {
      const before = await stats();
      const r = await run(
        `d = vd.Display(320, 240, title="Big batch")
g = d.canvas
img = np.zeros((240, 320, 4), np.uint8)
img[..., 0] = 200
img[..., 3] = 255
img[100:140, 140:180] = (0, 0, 250, 255)
p0 = vd._host.batches_posted()
for i in range(30):
    g.image(0, 0, img)
    g.fill_rect(0, 0, 10, 10, "lime")
    d.present()
    d.wait_frame()
for _ in range(4):
    d.wait_frame()
print("BIG", vd._host.batches_posted() - p0, vd._host.batches_dropped(), flush=True)
time.sleep(0.05)
try:
    for _ in range(20):
        g.image(0, 0, img)
    print("NO ERROR")
except vd.DisplayError as e:
    print("TOO BIG", str(e)[:40])
`,
        { on: { BIG: [{ do: 'pixel', name: 'a', x: 5, y: 5 }, { do: 'pixel', name: 'b', x: 160, y: 120 }, { do: 'pixel', name: 'c', x: 50, y: 50 }, { do: 'stats', name: 's' }] } },
      );
      const bad = fail(r, 'big batch');
      if (bad) return bad;
      const m = /BIG (\d+) (\d+)/.exec(r.out);
      if (!m || Number(m[1]) !== 30 || Number(m[2]) !== 0) return `posted/dropped ${m?.[1]}/${m?.[2]}`;
      if (!r.out.includes('TOO BIG')) return 'a frame over 4 MiB was accepted';
      const s = r.snaps.s;
      const ext = s.externalDrawn - before.externalDrawn;
      const recv = s.batchesReceived - before.batchesReceived;
      if (recv < 30 || ext < 10) return `received ${recv}, drawn from messages ${ext}`;
      if (!near(r.snaps.a, [0, 255, 0, 255]) || !near(r.snaps.b, [0, 0, 250, 255]) || !near(r.snaps.c, [200, 0, 0, 255])) {
        return `pixels ${JSON.stringify([r.snaps.a, r.snaps.b, r.snaps.c])}`;
      }
      return { note: `30 batches of ${320 * 240 * 4 + 48} bytes posted, ${ext} frames drawn from them` };
    });

    await check('resize: the panel offers a size (scale="window"), the program follows with d.resize()', async () => {
      const r = await run(
        `d = vd.Display(100, 80, title="Win", scale="window")
print("READY", flush=True)
ev = d.wait_event(3.0)
print("EV", ev.type if ev else None, ev.x if ev else -1, ev.y if ev else -1)
d.resize(ev.x, ev.y)
px = d.pixels
px[..., 1] = 200
d.canvas.fill_rect(0, 0, 5, 5, "red")
d.present()
for _ in range(4):
    d.wait_frame()
print("SIZE", d.size, px.shape, flush=True)
time.sleep(0.05)
`,
        { on: { READY: [{ do: 'resize', name: 'rz', w: 300, h: 200, delay: 50 }], SIZE: [{ do: 'pixel', name: 'a', x: 2, y: 2 }, { do: 'pixel', name: 'b', x: 250, y: 150 }] } },
      );
      const bad = fail(r, 'resize');
      if (bad) return bad;
      if (!r.snaps.rz || !r.out.includes('EV resize 300 200') || !r.out.includes('SIZE (300, 200) (200, 300, 4)')) return r.out.slice(0, 300);
      const info = await page.evaluate(() => {
        const c = window.__pythonHarness.displayCanvas();
        return { ...window.__disp.renderer.info, cw: c.width, ch: c.height };
      });
      if (info.width !== 300 || info.height !== 200 || info.cw !== 300 || info.ch !== 200 || info.scale !== 'window') return JSON.stringify(info);
      if (!near(r.snaps.a, [255, 0, 0, 255]) || !near(r.snaps.b, [0, 200, 0, 255])) return `pixels ${JSON.stringify([r.snaps.a, r.snaps.b])}`;
      const r2 = await run('d = vd.Display(10, 10)\nprint("FIT", flush=True)\ntime.sleep(0.05)\n', { on: { FIT: [{ do: 'resize', name: 'rz', w: 50, h: 50 }] } });
      if (r2.snaps.rz !== false) return 'requestResize accepted for scale="fit"';
      return true;
    });

    await check('close: the visitor closing the panel ends a loop, wakes wait_event, gives a close event', async () => {
      const r = await run(
        `d = vd.Display(120, 90, title="Close me")
g = d.canvas
clock = vd.Clock()
print("LOOP", flush=True)
n = 0
t0 = vd._now()
while not d.closed and vd._now() - t0 < 5:
    g.clear("navy")
    d.present()
    clock.tick(60)
    n += 1
t_end = vd._now() * 1000
evs = [e.type for e in d.poll()]
d.present()
wf = d.wait_frame()
print("CLOSED", json.dumps({"closed": d.closed, "evs": evs, "n": n, "wf": wf, "t": t_end, "again": d.poll()}))
d2 = vd.Display(50, 50, title="Wait")
print("WAITING", flush=True)
ev = d2.wait_event()
t_woke = vd._now() * 1000
print("WOKE", json.dumps({"type": ev.type if ev else None, "t": t_woke, "closed": d2.closed, "after": d2.wait_event(0.1)}))
`,
        { on: { LOOP: [{ do: 'close', name: 'c1', delay: 500 }], WAITING: [{ do: 'close', name: 'c2', delay: 300 }] } },
      );
      const bad = fail(r, 'close');
      if (bad) return bad;
      const a = JSON.parse(r.out.split('CLOSED ')[1].split('\n')[0]);
      const b = JSON.parse(r.out.split('WOKE ')[1].split('\n')[0]);
      if (!r.snaps.c1?.ok || !r.snaps.c2?.ok) return 'requestClose returned false';
      if (!a.closed || JSON.stringify(a.evs) !== '["close"]' || a.wf !== false || a.again.length !== 0 || a.n < 10) return JSON.stringify(a);
      if (b.type !== 'close' || !b.closed || b.after !== null) return JSON.stringify(b);
      const loopMs = a.t - r.snaps.c1.epoch;
      const waitMs = b.t - r.snaps.c2.epoch;
      metrics.closeMs = { loop: loopMs, wait: waitMs };
      const note = `loop ended ${f1(loopMs)} ms after close, wait_event woke after ${f1(waitMs)} ms`;
      if (loopMs > 100 || waitMs > 100) return `slow close: ${note}`;
      const info = await page.evaluate(() => window.__disp.renderer.info);
      if (info.open) return 'renderer still open after requestClose';
      return { note };
    });

    // The four examples, as P8 will list them.
    const examples = await page.evaluate(() =>
      window.__pythonHarness.displayExamples.map((ex) => ({ id: ex.id, code: ex.files[ex.entry] })),
    );
    const byId = Object.fromEntries(examples.map((e) => [e.id, e.code]));
    const ki = (r) => !r.res?.ok && JSON.stringify(r.res).includes('KeyboardInterrupt');
    const stopPlan = (extra = []) => ({ start: [...extra, { do: 'stats', name: 'pre', delay: 1950 }, { do: 'stop', delay: 2000 }] });
    const judgeStop = (r, label, minPresented) => {
      if (!ki(r)) return `${label}: not ended by KeyboardInterrupt: ${JSON.stringify(r.res).slice(0, 300)} ${r.err.slice(-200)}`;
      if (r.stopMs > 300) return `${label}: Stop took ${f1(r.stopMs)} ms`;
      if ((r.snaps.pre?.presented ?? 0) < minPresented) return `${label}: only ${r.snaps.pre?.presented} frames presented`;
      return null;
    };

    await check('example bouncing_ball: frames for 2 s, Stop ends it', async () => {
      const r = await run(byId.bouncing_ball, stopPlan(), true);
      const bad = judgeStop(r, 'bouncing_ball', browserName === 'webkit' ? 20 : 90);
      if (bad) return bad;
      return { note: `${r.snaps.pre.presented} frames in 2 s, Stop ${f1(r.stopMs)} ms` };
    });

    await check('example paint: a pointer drag draws a stroke, Stop ends it', async () => {
      const drag = [{ k: 'pointer', kind: 'down', x: 40, y: 120, button: 0, buttons: 1 }];
      for (let x = 50; x <= 280; x += 10) drag.push({ k: 'wait', ms: 10 }, { k: 'pointer', kind: 'move', x, y: 120, buttons: 1 });
      drag.push({ k: 'pointer', kind: 'up', x: 280, y: 120, button: 0, buttons: 0 });
      const r = await run(
        byId.paint,
        stopPlan([
          { do: 'pixel', name: 'before', x: 240, y: 160, delay: 700 },
          { do: 'push', list: drag, delay: 800 },
          { do: 'pixel', name: 'after', x: 240, y: 160, delay: 1700 },
        ]),
        true,
      );
      const bad = judgeStop(r, 'paint', 2);
      if (bad) return bad;
      if (!near(r.snaps.before, [32, 32, 32, 255]) || !near(r.snaps.after, [255, 255, 255, 255])) {
        return `stroke pixel before/after ${JSON.stringify([r.snaps.before, r.snaps.after])}`;
      }
      return { note: `${r.snaps.pre.presented} frames, Stop ${f1(r.stopMs)} ms` };
    });

    await check('example numpy_fractal: 30 bands presented; Stop mid-way ends it', async () => {
      const t0 = Date.now();
      const r = await run(byId.numpy_fractal, {}, true);
      const bad = fail(r, 'fractal');
      if (bad) return bad;
      const secs = (Date.now() - t0) / 1000;
      if (!/Done in \d+\.\d+ s/.test(r.out)) return r.out.slice(0, 200);
      const px = await pixels([[533, 240], [10, 10]]);
      const presented = await page.evaluate(() => window.__disp.renderer.stats().presented);
      if (presented !== 30) return `presented ${presented}`;
      if (near(px[0], px[1], 0)) return `picture looks flat ${JSON.stringify(px)}`;
      const r2 = await run(byId.numpy_fractal, { start: [{ do: 'stop', delay: 250 }] }, true);
      if (!ki(r2)) return `not ended by KeyboardInterrupt: ${JSON.stringify(r2.res).slice(0, 300)}`;
      if (r2.stopMs > 300) return `Stop took ${f1(r2.stopMs)} ms`;
      return { note: `whole run ${f1(secs)} s, Stop ${f1(r2.stopMs)} ms` };
    });

    await check('example fps_loop: about 60 fps printed, Stop ends it', async () => {
      const r = await run(byId.fps_loop, { start: [{ do: 'stats', name: 'pre', delay: 2950 }, { do: 'stop', delay: 3000 }] }, true);
      const bad = judgeStop(r, 'fps_loop', browserName === 'webkit' ? 20 : 90);
      if (bad) return bad;
      const fps = [...r.out.matchAll(/^(\d+\.\d) fps$/gm)].map((m) => Number(m[1]));
      if (fps.length < 2) return `fps lines: ${r.out.slice(0, 200)}`;
      metrics.fpsLoop = fps[fps.length - 1];
      const note = `printed ${fps.join(', ')} fps, Stop ${f1(r.stopMs)} ms`;
      if (browserName !== 'webkit' && fps[fps.length - 1] < 45) return `slow: ${note}`;
      return { note };
    });

    await check('no page errors (draw checks)', async () => (pageErrors.length === 0 ? true : pageErrors.slice(0, 3).join(' | ')));
  } finally {
    await page.evaluate(() => {
      window.__disp?.renderer.dispose();
      window.__disp?.client.dispose();
    }).catch(() => {});
    await ctx.close();
  }
  return metrics;
}
