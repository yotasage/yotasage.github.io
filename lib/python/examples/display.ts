// Built-in examples for the Display panel (vdisplay, P7b): drawing commands, input, NumPy pixels
// and a steady frame loop. Not in PYTHON_EXAMPLES yet: P8 adds them to the ordered list together
// with the Display panel, so the Examples tab never offers a program whose output cannot be seen.
import type { PythonExample } from './types';
import { pySource } from './types';

export const bouncingBallExample: PythonExample = {
  id: 'bouncing_ball',
  tag: 'display',
  titleKey: 'python.example.bouncing_ball.title',
  descriptionKey: 'python.example.bouncing_ball.desc',
  entry: 'bouncing_ball/main.py',
  files: {
    'bouncing_ball/main.py': pySource(String.raw`
# Bouncing ball
# Shows: drawing shapes and text with d.canvas, and a steady 60 fps loop with vd.Clock.
# Expect: a ball bouncing around the Display panel. Close the panel or press Stop to end.
import vdisplay as vd

W, H, R = 480, 320, 18
d = vd.Display(W, H, title="Bouncing ball")
g = d.canvas
clock = vd.Clock()
x, y = 80.0, 60.0      # position in pixels
vx, vy = 230.0, 170.0  # speed in pixels per second
bounces = 0

while not d.closed:
    dt = clock.tick(60)  # waits so the loop runs 60 times a second
    x += vx * dt
    y += vy * dt
    if not R <= x <= W - R:
        vx = -vx
        x = min(max(x, R), W - R)
        bounces += 1
    if not R <= y <= H - R:
        vy = -vy
        y = min(max(y, R), H - R)
        bounces += 1

    g.clear("#1e1e2e")
    g.circle(x + 4, y + 6, R, (0, 0, 0, 90))            # shadow
    g.circle(x, y, R, "tomato")
    g.circle(x - 6, y - 6, R / 3, (255, 255, 255, 140))  # highlight
    g.text(10, 10, f"bounces: {bounces}", size=16, color="white")
    g.text(W - 10, 10, f"{clock.get_fps():.0f} fps", size=14, color="gray", align="right")
    d.present()
`),
  },
};

export const paintExample: PythonExample = {
  id: 'paint',
  tag: 'display',
  titleKey: 'python.example.paint.title',
  descriptionKey: 'python.example.paint.desc',
  entry: 'paint/main.py',
  files: {
    'paint/main.py': pySource(String.raw`
# Paint
# Shows: reading pointer and key events with d.wait_event() and d.poll().
# Expect: drag in the Display panel to draw. Keys 1-4 change the colour, c clears.
import vdisplay as vd

d = vd.Display(480, 320, title="Paint")
g = d.canvas
COLOURS = {"1": "white", "2": "tomato", "3": "gold", "4": "deepskyblue"}
colour = "white"
strokes = []   # each stroke is (colour, [(x, y), ...])
current = None


def draw():
    g.clear("#202020")
    for c, points in strokes:
        if len(points) == 1:
            g.circle(points[0][0], points[0][1], 3, c)
        else:
            g.polyline(points, c, width=6)
    g.text(8, 8, "drag to draw   1-4 colour   c clear", size=14, color="gray")
    g.fill_rect(452, 8, 20, 20, colour)
    d.present()


draw()
while not d.closed:
    first = d.wait_event()       # sleeps until something happens
    for ev in [first] + d.poll():  # plus whatever queued up meanwhile
        if ev is None:
            continue
        if ev.type == "pointerdown":
            current = (colour, [(ev.x, ev.y)])
            strokes.append(current)
        elif ev.type == "pointermove" and current and ev.buttons:
            current[1].append((ev.x, ev.y))
        elif ev.type == "pointerup":
            current = None
        elif ev.type == "keydown" and ev.key.lower() == "c":
            strokes.clear()
        elif ev.type == "keydown" and ev.key in COLOURS:
            colour = COLOURS[ev.key]
    draw()
`),
  },
};

export const fractalExample: PythonExample = {
  id: 'numpy_fractal',
  tag: 'display',
  titleKey: 'python.example.numpy_fractal.title',
  descriptionKey: 'python.example.numpy_fractal.desc',
  entry: 'numpy_fractal/main.py',
  files: {
    'numpy_fractal/main.py': pySource(String.raw`
# NumPy Mandelbrot
# Shows: computing pixels with NumPy and showing each band of rows as soon as it is done.
# Expect: the Mandelbrot set appearing from top to bottom, then the time it took.
import time

import numpy as np
import vdisplay as vd

W, H, MAX_ITER, BAND = 640, 480, 256, 16
d = vd.Display(W, H, title="Mandelbrot")
px = d.pixels  # uint8 array, shape (H, W, 4)

# A colour for each escape count; points that never escape stay black.
t = np.linspace(0.0, 1.0, MAX_ITER + 1)
palette = np.stack([9 * (1 - t) * t**3, 15 * (1 - t) ** 2 * t**2, 8.5 * (1 - t) ** 3 * t], axis=1)
palette = (np.clip(palette, 0, 1) * 255).astype(np.uint8)
palette[MAX_ITER] = 0

re = np.linspace(-2.2, 0.8, W)
im = np.linspace(1.1, -1.1, H)
start = time.perf_counter()
for top in range(0, H, BAND):
    c = re[None, :] + 1j * im[top:top + BAND, None]
    z = np.zeros_like(c)
    count = np.full(c.shape, MAX_ITER)
    alive = np.ones(c.shape, dtype=bool)
    for i in range(MAX_ITER):
        z[alive] = z[alive] ** 2 + c[alive]
        escaped = alive & (np.abs(z) > 2)
        count[escaped] = i
        alive &= ~escaped
    px[top:top + BAND, :, :3] = palette[count]
    d.present()  # show the rows done so far

print(f"Done in {time.perf_counter() - start:.2f} s. The picture stays in the Display panel.")
`),
  },
};

export const fpsLoopExample: PythonExample = {
  id: 'fps_loop',
  tag: 'display',
  titleKey: 'python.example.fps_loop.title',
  descriptionKey: 'python.example.fps_loop.desc',
  entry: 'fps_loop/main.py',
  files: {
    'fps_loop/main.py': pySource(String.raw`
# 60 fps animation
# Shows: new NumPy pixels every frame plus 200 circles drawn over them, at 60 frames a second.
# Expect: moving colour waves under a swirl of dots; the measured frame rate printed every second.
import math
import time

import numpy as np
import vdisplay as vd

W, H, DOTS = 320, 200, 200
d = vd.Display(W, H, title="60 fps")
px = d.pixels
g = d.canvas
clock = vd.Clock()
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
t = 0.0
last_print = time.perf_counter()

while not d.closed:
    t += clock.tick(60)
    wave = np.sin(xx * 0.045 + t * 2.0) + np.sin(yy * 0.06 - t * 1.4) + np.sin((xx + yy) * 0.03 + t)
    px[..., 0] = 120 + 40 * wave
    px[..., 1] = 60 + 20 * wave
    px[..., 2] = 160 - 30 * wave
    for i in range(DOTS):
        a = t * 0.8 + i * 0.12
        r = 20 + i * 0.4
        g.circle(W / 2 + math.cos(a) * r, H / 2 + math.sin(a * 1.1) * r * 0.6, 2.5, (255, 255, 255, 170))
    g.text(6, 6, f"{clock.get_fps():.1f} fps", size=14, color="white", font="mono")
    d.present()
    now = time.perf_counter()
    if now - last_print >= 1.0:
        print(f"{clock.get_fps():.1f} fps")
        last_print = now
`),
  },
};

/** The display examples in the order P8 should list them (after the plots examples). */
export const DISPLAY_EXAMPLES: readonly PythonExample[] = [
  bouncingBallExample,
  paintExample,
  fractalExample,
  fpsLoopExample,
];
