"""vdisplay: a pixel window for programs in the Python playground.

    import vdisplay as vd
    d = vd.Display(320, 240, title="Demo")
    d.pixels[..., 0] = 255          # NumPy uint8 array, shape (height, width, 4), RGBA
    g = d.canvas                    # drawing commands, drawn over the pixels of the same frame
    g.circle(160, 120, 40, "tomato")
    g.text(10, 10, "Hello", size=20, color="white")
    d.present()                     # show the frame (pixels, then the commands)
    for ev in d.poll(): ...         # input since the last call
    d.wait_frame()                  # wait for the page's next frame
    clock = vd.Clock(); dt = clock.tick(60)

Each frame starts from d.pixels (or from black, as long as the program never touched d.pixels),
then the commands given to d.canvas since the last present() are drawn on top; they do not carry
over to the next frame. Only one window exists: a new Display closes the one before it.
Display needs Tier 1 (the page cross-origin isolated), where the program and the page share memory.
"""

import struct
from collections import deque

import yotasage_display as _host

__all__ = [
    "Canvas",
    "Clock",
    "Display",
    "DisplayError",
    "Event",
    "FONTS",
    "MAX_HEIGHT",
    "MAX_WIDTH",
    "MOD_ALT",
    "MOD_CTRL",
    "MOD_META",
    "MOD_SHIFT",
    "color",
]

MAX_WIDTH = int(_host.max_width)
MAX_HEIGHT = int(_host.max_height)
MOD_SHIFT = 1
MOD_CTRL = 2
MOD_ALT = 4
MOD_META = 8

_EV_CAP = int(_host.ev_capacity)
_EV_BYTES = int(_host.ev_record_bytes)
_EV_HEAD = struct.Struct("<6id2f4B")
_EV_TYPES = {
    1: "pointerdown",
    2: "pointerup",
    3: "pointermove",
    4: "wheel",
    5: "keydown",
    6: "keyup",
    7: "resize",
}
_SCALES = ("fit", "pixel", "window")
# Frames and events go by address through the worker's view of wasm memory; without it (a Pyodide
# change), by buffer, with a Stop during the conversion turned back into KeyboardInterrupt.
_HEAP_OK = bool(_host.heap_ok)
_current = None

# Host return codes (display-host.js).
_RC_GONE = -2
_RC_VISITOR_CLOSED = -6


class DisplayError(RuntimeError):
    """The display cannot do what was asked (wrong tier, closed, bad size, too much drawing)."""


def _now() -> float:
    """Seconds since the epoch on the page's high-resolution clock (the clock of Event.t)."""
    return float(_host.now_ms()) / 1000.0


def _need_tier1() -> None:
    if not _host.usable:
        raise DisplayError(
            f"vdisplay needs Tier 1, but Python runs in Tier {int(_host.tier)} in this browser. "
            "A program can only draw while it runs when the page is cross-origin isolated: reload the "
            "page, and if that does not help, use a browser window where the site's service worker "
            "can run (not a private window that blocks it)."
        )


def _numpy():
    try:
        import numpy
    except ImportError as exc:  # autoLoadPackages off, or a run that bypassed the import scan
        raise DisplayError(
            "vdisplay needs NumPy, which is bundled but was not loaded. Add 'import numpy' at the top "
            "of your program and run it again."
        ) from exc
    return numpy


def _address(arr) -> int:
    return int(arr.__array_interface__["data"][0])


def _interrupt_from(exc: BaseException) -> None:
    """A Stop that lands while Pyodide converts an argument surfaces as ConversionError."""
    cause = exc.__cause__ or exc.__context__
    if isinstance(cause, KeyboardInterrupt):
        raise KeyboardInterrupt from None


def _host_call(fn, *args):
    try:
        return fn(*args)
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        if type(exc).__name__ == "ConversionError":
            _interrupt_from(exc)
        raise


_UNSAFE_TITLE = frozenset("‎‏‪‫‬‭‮⁦⁧⁨⁩")


def _clean_title(title) -> str:
    """Plain text as the page shows it: no control characters or bidi marks, at most 200 characters."""
    text = "".join(
        ch for ch in str(title) if ch >= " " and not "\x7f" <= ch <= "\x9f" and ch not in _UNSAFE_TITLE
    )
    return text.strip()[:200]


# --- colours ----------------------------------------------------------------------------------
# The CSS named colours (CSS Color 4). Colours are parsed here, never sent to the page as text.
_NAMES = """
aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc
bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a
burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50
cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b
darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b
darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000
darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f
darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff
dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0
forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520
gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4
indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5
lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff
lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1
lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899
lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32
linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd
mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee
mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970
mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6
olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa
palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9
peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399
red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460
seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd
slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c
teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3
white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32
"""


def _rgb_u32(v: int, a: int = 255) -> int:
    return (v >> 16) | (v & 0xFF00) | ((v & 0xFF) << 16) | (a << 24)


_NAMED = {name: _rgb_u32(int(hx, 16)) for name, hx in (item.split(":") for item in _NAMES.split())}
_NAMED["transparent"] = 0
_HEX = frozenset("0123456789abcdef")
_COLOR_CACHE = {}
_COLOR_HELP = (
    "use a CSS colour name such as 'tomato', '#rgb', '#rgba', '#rrggbb', '#rrggbbaa' "
    "or an (r, g, b) or (r, g, b, a) tuple of numbers 0-255"
)


def _parse_color(c) -> int:
    if isinstance(c, str):
        s = c.strip().lower()
        if s.startswith("#"):
            h = s[1:]
            if len(h) in (3, 4, 6, 8) and all(ch in _HEX for ch in h):
                if len(h) <= 4:
                    h = "".join(ch * 2 for ch in h)
                v = int(h, 16)
                return _rgb_u32(v >> 8, v & 255) if len(h) == 8 else _rgb_u32(v)
        else:
            v = _NAMED.get(s)
            if v is not None:
                return v
        raise ValueError(f"unknown colour {c!r}: {_COLOR_HELP}")
    try:
        n = len(c)
    except TypeError:
        raise TypeError(f"a colour cannot be {type(c).__name__}: {_COLOR_HELP}") from None
    if n not in (3, 4):
        raise ValueError(f"a colour tuple has 3 or 4 numbers, not {n}")
    out = []
    for v in c:
        f = float(v)
        if not 0.0 <= f <= 255.0:
            raise ValueError(f"colour channel {v!r} is outside 0-255")
        out.append(int(f + 0.5))
    a = out[3] if n == 4 else 255
    return out[0] | (out[1] << 8) | (out[2] << 16) | (a << 24)


def _rgba(c) -> int:
    """A colour as u32 RGBA (r in the low byte); strings and tuples are cached."""
    try:
        return _COLOR_CACHE[c]
    except (KeyError, TypeError):
        pass
    v = _parse_color(c)
    if len(_COLOR_CACHE) < 4096:
        try:
            _COLOR_CACHE[c] = v
        except TypeError:
            pass
    return v


def color(c):
    """Parses a colour as the drawing commands do and returns (r, g, b, a), each 0-255."""
    v = _rgba(c)
    return (v & 255, (v >> 8) & 255, (v >> 16) & 255, v >> 24)


# --- draw commands ----------------------------------------------------------------------------
# Record layout and caps: lib/python/displayProtocol.ts (the page checks every record again).
_MAX_BATCH = int(_host.max_batch)
_MAX_POINTS = 65536
_MAX_TEXT_BYTES = 4096
_MAX_TEXT_SIZE = 512
_MAX_DEPTH = 64
_MAX_LINE_WIDTH = 1024
_OP_CLEAR, _OP_FILL_RECT, _OP_RECT, _OP_LINE, _OP_POLY, _OP_CIRCLE, _OP_ELLIPSE, _OP_ARC = range(1, 9)
_OP_TEXT, _OP_IMAGE, _OP_SAVE, _OP_RESTORE, _OP_TRANSLATE, _OP_ROTATE, _OP_SCALE = range(9, 16)
_OP_CLIP_RECT, _OP_ALPHA = 16, 17
_FLAG_CLOSED = 1 << 8
_FLAG_FILL = 2 << 8
_FLAG_SMOOTH = 1 << 8

FONTS = ("sans", "serif", "mono")
_FONT_IDS = {"sans": 0, "sans-serif": 0, "serif": 1, "mono": 2, "monospace": 2}
_ALIGNS = {"left": 0, "center": 1, "centre": 1, "right": 2}
_BASELINES = {"top": 0, "middle": 1, "alphabetic": 2, "bottom": 3}

_S_HDR = struct.Struct("<I")
_S_COLOR = struct.Struct("<II")
_S_F1 = struct.Struct("<If")
_S_F2 = struct.Struct("<Iff")
_S_F4 = struct.Struct("<I4f")
_S_F4C = struct.Struct("<I4fI")
_S_F5C = struct.Struct("<I5fI")
_S_F6C = struct.Struct("<I6fI")
_S_POLY = struct.Struct("<IIfI")
_S_TEXT = struct.Struct("<I3fI")
_S_IMAGE = struct.Struct("<I4fHH")


def _not_finite():
    raise ValueError("drawing coordinates and sizes must be finite numbers")


class Canvas:
    """Drawing commands for the next frame of a Display (``d.canvas``).

    Coordinates are display pixels, y pointing down; angles are radians, clockwise on screen.
    Colours: CSS names ("tomato"), "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", or (r, g, b[, a])
    tuples of 0-255. Lines have round ends and joins; width=None uses line_width() (1 at first).
    Commands are drawn in order over the frame's pixels when present() is called, then forgotten.
    """

    __slots__ = ("_np", "_buf", "_cap", "_off", "_ptr", "_lw", "_stack")

    def __init__(self) -> None:
        np = _numpy()
        self._np = np
        self._cap = 65536
        self._buf = np.zeros(self._cap, dtype=np.uint8)
        self._ptr = _address(self._buf)
        self._off = 0
        self._lw = 1.0
        self._stack = []

    def _grow(self, need: int) -> None:
        if need > _MAX_BATCH:
            raise DisplayError(
                f"this frame's drawing commands need more than {_MAX_BATCH // (1024 * 1024)} MiB: "
                "draw fewer or smaller items (images take 4 bytes a pixel) or call present() more often"
            )
        cap = min(_MAX_BATCH, max(need, self._cap * 2))
        buf = self._np.zeros(cap, dtype=self._np.uint8)
        buf[: self._off] = self._buf[: self._off]
        self._buf = buf
        self._cap = cap
        self._ptr = _address(buf)

    def _reset(self) -> None:
        self._off = 0
        self._lw = 1.0
        self._stack.clear()

    def _width(self, width) -> float:
        if width is None:
            return self._lw
        w = float(width)
        if not 0.0 <= w <= _MAX_LINE_WIDTH:
            raise ValueError(f"line width must be 0-{_MAX_LINE_WIDTH}, not {width!r}")
        return w

    def _put(self, s, size, *values) -> None:
        o = self._off
        n = o + size
        if n > self._cap:
            self._grow(n)
        s.pack_into(self._buf, o, *values)
        self._off = n

    # --- shapes ---------------------------------------------------------------------------------
    def clear(self, color="black") -> None:
        """Fills the whole display with color (alpha included), ignoring transforms and alpha()."""
        self._put(_S_COLOR, 8, _OP_CLEAR, _rgba(color))

    def fill_rect(self, x, y, w, h, color="white") -> None:
        """A filled rectangle with its top-left corner at (x, y)."""
        if (x + y + w + h) * 0:
            _not_finite()
        self._put(_S_F4C, 24, _OP_FILL_RECT, x, y, w, h, _rgba(color))

    def rect(self, x, y, w, h, color="white", width=None) -> None:
        """A rectangle outline."""
        if (x + y + w + h) * 0:
            _not_finite()
        self._put(_S_F5C, 28, _OP_RECT, x, y, w, h, self._width(width), _rgba(color))

    def line(self, x1, y1, x2, y2, color="white", width=None) -> None:
        """A straight line from (x1, y1) to (x2, y2)."""
        if (x1 + y1 + x2 + y2) * 0:
            _not_finite()
        self._put(_S_F5C, 28, _OP_LINE, x1, y1, x2, y2, self._width(width), _rgba(color))

    def _path(self, flags: int, points, color, width) -> None:
        np = self._np
        pts = np.ascontiguousarray(points, dtype=np.float32)
        if pts.size == 0:
            pts = pts.reshape(0, 2)
        if pts.ndim != 2 or pts.shape[1] != 2:
            raise ValueError("points must be a sequence of (x, y) pairs or an array of shape (n, 2)")
        n = int(pts.shape[0])
        if n > _MAX_POINTS:
            raise ValueError(f"a path has at most {_MAX_POINTS} points, not {n}")
        if n and not np.isfinite(pts).all():
            _not_finite()
        lw = self._width(width)
        c = _rgba(color)
        o = self._off
        end = o + 16 + 8 * n
        if end > self._cap:
            self._grow(end)
        _S_POLY.pack_into(self._buf, o, _OP_POLY | flags, n, lw, c)
        if n:
            self._buf[o + 16 : end] = pts.reshape(-1).view(np.uint8)
        self._off = end

    def polyline(self, points, color="white", width=None, closed=False) -> None:
        """Lines through points [(x, y), ...] (or an (n, 2) array); closed=True joins the ends."""
        self._path(_FLAG_CLOSED if closed else 0, points, color, width)

    def polygon(self, points, color="white", fill=True, width=None) -> None:
        """A filled polygon (fill=False: its outline)."""
        self._path(_FLAG_FILL if fill else _FLAG_CLOSED, points, color, width)

    def circle(self, x, y, r, color="white", fill=True, width=None) -> None:
        """A filled circle of radius r around (x, y) (fill=False: its outline)."""
        if (x + y + r) * 0:
            _not_finite()
        if r < 0:
            raise ValueError("a radius cannot be negative")
        self._put(_S_F4C, 24, _OP_CIRCLE | (_FLAG_FILL if fill else 0), x, y, r, self._width(width), _rgba(color))

    def ellipse(self, x, y, rx, ry, color="white", fill=True, width=None, rotation=0.0) -> None:
        """A filled ellipse with radii rx, ry around (x, y), turned by rotation (radians)."""
        if (x + y + rx + ry + rotation) * 0:
            _not_finite()
        if rx < 0 or ry < 0:
            raise ValueError("a radius cannot be negative")
        flags = _FLAG_FILL if fill else 0
        self._put(_S_F6C, 32, _OP_ELLIPSE | flags, x, y, rx, ry, rotation, self._width(width), _rgba(color))

    def arc(self, x, y, r, start, end, color="white", width=None, fill=False) -> None:
        """An arc of the circle around (x, y) from angle start to end (radians, clockwise from +x).

        fill=True draws the filled pie slice instead.
        """
        if (x + y + r + start + end) * 0:
            _not_finite()
        if r < 0:
            raise ValueError("a radius cannot be negative")
        flags = _FLAG_FILL if fill else 0
        self._put(_S_F6C, 32, _OP_ARC | flags, x, y, r, start, end, self._width(width), _rgba(color))

    def text(self, x, y, s, size=16, color="white", font="sans", align="left", baseline="top") -> None:
        """Text at (x, y): font "sans", "serif" or "mono"; align "left", "center" or "right";
        baseline "top", "middle", "alphabetic" or "bottom" (which part of the text y is)."""
        data = str(s).encode("utf-8")
        n = len(data)
        if n > _MAX_TEXT_BYTES:
            raise ValueError(f"text is at most {_MAX_TEXT_BYTES} bytes of UTF-8 per call, not {n}")
        f = _FONT_IDS.get(font)
        if f is None:
            raise ValueError(f"font must be one of {', '.join(FONTS)}, not {font!r}")
        a = _ALIGNS.get(align)
        if a is None:
            raise ValueError(f"align must be 'left', 'center' or 'right', not {align!r}")
        b = _BASELINES.get(baseline)
        if b is None:
            raise ValueError(f"baseline must be 'top', 'middle', 'alphabetic' or 'bottom', not {baseline!r}")
        px = float(size)
        if not 1.0 <= px <= _MAX_TEXT_SIZE:
            raise ValueError(f"text size must be 1-{_MAX_TEXT_SIZE} pixels, not {size!r}")
        if (x + y) * 0:
            _not_finite()
        c = _rgba(color)
        o = self._off
        end = o + 20 + ((n + 3) & ~3)
        if end > self._cap:
            self._grow(end)
        _S_TEXT.pack_into(self._buf, o, _OP_TEXT | ((f | a << 2 | b << 4) << 8) | (n << 16), x, y, px, c)
        if n:
            self._buf.data[o + 20 : o + 20 + n] = data
        self._off = end

    def image(self, x, y, pixels, width=None, height=None, smooth=False) -> None:
        """A uint8 array of shape (h, w, 4) RGBA, (h, w, 3) RGB or (h, w) grey, top-left at (x, y).

        width/height scale it (default: its own size); smooth=False keeps pixels sharp.
        At most 1920 x 1080, and a frame's commands at most 4 MiB in all.
        """
        np = self._np
        arr = np.asarray(pixels)
        if arr.dtype != np.uint8:
            raise TypeError(f"image() needs a uint8 array, not {arr.dtype} (use arr.astype(np.uint8))")
        if arr.ndim == 3 and arr.shape[2] in (3, 4):
            ch = int(arr.shape[2])
        elif arr.ndim == 2:
            ch = 1
        else:
            raise ValueError("image() needs an array of shape (h, w, 4), (h, w, 3) or (h, w)")
        h, w = int(arr.shape[0]), int(arr.shape[1])
        if not (1 <= w <= MAX_WIDTH and 1 <= h <= MAX_HEIGHT):
            raise ValueError(f"an image is 1 x 1 to {MAX_WIDTH} x {MAX_HEIGHT} pixels, not {w} x {h}")
        dw = float(w if width is None else width)
        dh = float(h if height is None else height)
        if (x + y + dw + dh) * 0:
            _not_finite()
        if dw < 0 or dh < 0:
            raise ValueError("an image's width and height cannot be negative")
        o = self._off
        end = o + 24 + w * h * 4
        if end > self._cap:
            self._grow(end)
        _S_IMAGE.pack_into(self._buf, o, _OP_IMAGE | (_FLAG_SMOOTH if smooth else 0), x, y, dw, dh, w, h)
        dst = self._buf[o + 24 : end].reshape(h, w, 4)
        if ch == 4:
            dst[...] = arr
        else:
            dst[..., :3] = arr if ch == 3 else arr[..., None]
            dst[..., 3] = 255
        self._off = end

    # --- state ----------------------------------------------------------------------------------
    def save(self) -> None:
        """Remembers the transform, clip, alpha and line width until the matching restore()."""
        if len(self._stack) >= _MAX_DEPTH:
            raise DisplayError(f"save() is nested more than {_MAX_DEPTH} deep")
        self._stack.append(self._lw)
        self._put(_S_HDR, 4, _OP_SAVE)

    def restore(self) -> None:
        """Goes back to the state of the matching save()."""
        if not self._stack:
            raise DisplayError("restore() without a matching save()")
        self._lw = self._stack.pop()
        self._put(_S_HDR, 4, _OP_RESTORE)

    def translate(self, dx, dy) -> None:
        if (dx + dy) * 0:
            _not_finite()
        self._put(_S_F2, 12, _OP_TRANSLATE, dx, dy)

    def rotate(self, angle) -> None:
        """Turns what is drawn next by angle radians (clockwise on screen) around the origin."""
        if angle * 0:
            _not_finite()
        self._put(_S_F1, 8, _OP_ROTATE, angle)

    def scale(self, sx, sy=None) -> None:
        if sy is None:
            sy = sx
        if (sx + sy) * 0:
            _not_finite()
        self._put(_S_F2, 12, _OP_SCALE, sx, sy)

    def clip_rect(self, x, y, w, h) -> None:
        """Limits drawing to a rectangle (also within an earlier clip) until restore()."""
        if (x + y + w + h) * 0:
            _not_finite()
        self._put(_S_F4, 20, _OP_CLIP_RECT, x, y, w, h)

    def line_width(self, width) -> None:
        """The width of lines and outlines drawn with width=None (1 at the start of each frame)."""
        self._lw = self._width(width)

    def alpha(self, a) -> None:
        """Opacity 0..1 of what is drawn next (multiplies the colours' own alpha)."""
        v = float(a)
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"alpha must be 0..1, not {a!r}")
        self._put(_S_F1, 8, _OP_ALPHA, v)


class Event:
    """One input event. Coordinates are display pixels; t is seconds since the epoch.

    type: "pointerdown", "pointerup", "pointermove", "wheel", "keydown", "keyup", "resize" or
    "close". button: the pointer button that changed (0 left, 1 middle, 2 right); buttons: those
    held (bits). key / code: KeyboardEvent.key and .code ("a", "ArrowLeft" / "KeyA"); text: the
    character a key types ("" for keys that type nothing or with Ctrl/Meta held). mods: MOD_SHIFT |
    MOD_CTRL | ... dx, dy: wheel distance in pixels; repeat: True for a held key's repeats.
    "resize" (scale="window" only): x, y are the size the panel offers; call d.resize(ev.x, ev.y)
    to follow it. "close": the visitor closed the Display panel (d.closed is now True).
    """

    __slots__ = ("type", "x", "y", "button", "buttons", "key", "code", "text", "mods", "t", "dx", "dy", "repeat")

    def __init__(self, type, x=0, y=0, button=0, buttons=0, key="", code="", text="", mods=0, t=0.0,
                 dx=0.0, dy=0.0, repeat=False):
        self.type = type
        self.x = x
        self.y = y
        self.button = button
        self.buttons = buttons
        self.key = key
        self.code = code
        self.text = text
        self.mods = mods
        self.t = t
        self.dx = dx
        self.dy = dy
        self.repeat = repeat

    def __repr__(self) -> str:
        if self.type in ("keydown", "keyup"):
            return f"Event({self.type!r}, key={self.key!r}, code={self.code!r}, mods={self.mods})"
        if self.type == "wheel":
            return f"Event('wheel', x={self.x}, y={self.y}, dx={self.dx:g}, dy={self.dy:g})"
        if self.type == "resize":
            return f"Event('resize', x={self.x}, y={self.y})"
        if self.type == "close":
            return "Event('close')"
        return f"Event({self.type!r}, x={self.x}, y={self.y}, button={self.button}, buttons={self.buttons})"


def _parse(buf, count: int):
    out = []
    for i in range(count):
        off = i * _EV_BYTES
        kind, x, y, button, buttons, mods, t, dx, dy, klen, clen, rep, _ = _EV_HEAD.unpack_from(buf, off)
        name = _EV_TYPES.get(kind)
        if name is None:
            continue
        key = code = text = ""
        if kind in (5, 6):
            key = bytes(buf[off + 44:off + 44 + min(klen, 32)]).decode("utf-8", "replace")
            code = bytes(buf[off + 76:off + 76 + min(clen, 20)]).decode("ascii", "replace")
            if kind == 5 and len(key) == 1 and not mods & (MOD_CTRL | MOD_META):
                text = key
        out.append(Event(name, x, y, button, buttons, key, code, text, mods, t / 1000.0, dx, dy, bool(rep)))
    return out


def _size(width, height):
    try:
        w = int(width)
        h = int(height)
    except (TypeError, ValueError):
        raise DisplayError("Display width and height must be whole numbers") from None
    if w < 1 or h < 1:
        raise DisplayError(f"Display size must be at least 1 x 1, not {w} x {h}")
    return min(w, MAX_WIDTH), min(h, MAX_HEIGHT)


class Display:
    """A window of width x height RGBA pixels shown in the Display panel.

    scale: "fit" (fill the panel, keeping the shape), "pixel" (one display pixel per screen pixel),
    a whole number 1..8 (that many screen pixels per display pixel) or "window" (like "fit", and the
    panel offers its own size with "resize" events). The program owns the size: it changes only
    through resize(). Sizes above MAX_WIDTH x MAX_HEIGHT (1920 x 1080) are reduced to it.

    When the visitor closes the panel, closed becomes True and poll()/wait_event() return a "close"
    event; present() then does nothing and wait_frame() returns False after 1/60 s, so end the
    loop with `while not d.closed:`.
    """

    def __init__(self, width: int = 640, height: int = 480, title: str = "Display", scale="fit"):
        global _current
        _need_tier1()
        w, h = _size(width, height)
        if scale not in _SCALES and not (isinstance(scale, int) and 1 <= scale <= 8):
            raise DisplayError('scale must be "fit", "pixel", "window" or a whole number from 1 to 8')
        np = _numpy()
        if _current is not None:
            _current._closed = True
        self._id = int(_host.open(w, h, _clean_title(title), scale))
        if self._id <= 0:
            raise DisplayError("The display could not be opened")
        _current = self
        self._closed = False
        self._vclosed = False
        self._px_used = False
        self._canvas = None
        self._w = w
        self._h = h
        self._pixels = np.zeros((h, w, 4), dtype=np.uint8)
        self._pixels[..., 3] = 255
        self._ptr = _address(self._pixels)
        self._nbytes = int(self._pixels.nbytes)
        self._evbuf = np.zeros(_EV_CAP * _EV_BYTES, dtype=np.uint8)
        self._evptr = _address(self._evbuf)
        self._queue = deque()
        self.title = _clean_title(title)
        self.scale = scale

    # --- properties -------------------------------------------------------------------------
    @property
    def pixels(self):
        """The frame's pixels: NumPy uint8 array, shape (height, width, 4), RGBA. Alpha starts at 255.

        Until a program first uses it, frames start black and present() copies no pixels.
        """
        self._px_used = True
        return self._pixels

    @pixels.setter
    def pixels(self, value) -> None:
        self._px_used = True
        self._pixels[...] = value

    @property
    def canvas(self) -> Canvas:
        """Drawing commands for the next present(), drawn over the pixels."""
        if self._canvas is None:
            self._canvas = Canvas()
        return self._canvas

    @property
    def size(self):
        return (self._w, self._h)

    @property
    def width(self) -> int:
        return self._w

    @property
    def height(self) -> int:
        return self._h

    @property
    def closed(self) -> bool:
        if not self._closed:
            st = int(_host.state(self._id))
            if st == 2:
                self._visitor_close()
            elif st != 0:
                self._closed = True
        return self._closed

    def _visitor_close(self) -> None:
        global _current
        if not self._vclosed:
            self._vclosed = True
            self._closed = True
            self._queue.append(Event("close", t=_now()))
        if _current is self:
            _current = None

    def _check_open(self) -> None:
        if self._closed and not self._vclosed:
            raise DisplayError("This display is closed (a newer Display replaced it, or close() was called)")

    def _failed(self, what: str, rc: int):
        if rc == _RC_GONE:
            self._closed = True
            self._check_open()
        raise DisplayError(f"{what} failed (code {rc})")

    # --- frames -----------------------------------------------------------------------------
    def present(self) -> None:
        """Shows d.pixels with the canvas commands drawn over them, then starts a new command list.

        While the page is hidden, this waits so the loop runs at about 4 frames a second.
        """
        c = self._canvas
        if self._closed:
            if c is not None:
                c._reset()
            self._check_open()
            return
        px = self._px_used
        clen = c._off if c is not None else 0
        try:
            if _HEAP_OK:
                rc = _host.present(
                    self._id,
                    self._ptr if px else 0,
                    self._nbytes if px else 0,
                    c._ptr if clen else 0,
                    clen,
                )
            else:
                rc = _host_call(
                    _host.present_buffer,
                    self._id,
                    self._pixels.reshape(-1) if px else None,
                    c._buf[:clen] if clen else None,
                )
        finally:
            if c is not None:
                c._reset()
        if rc == _RC_VISITOR_CLOSED:
            self._visitor_close()
        elif rc < 0:
            self._failed("present()", rc)

    def wait_frame(self) -> bool:
        """Waits for the page's next frame (returns True), or 0.1 s when the page draws none (False).

        Blocks while the page or the Display panel is hidden. Stop interrupts it.
        """
        self._check_open()
        if not self._vclosed:
            rc = int(_host.wait_frame(self._id))
            if rc == _RC_VISITOR_CLOSED:
                self._visitor_close()
            elif rc < 0:
                self._failed("wait_frame()", rc)
            else:
                return rc == 1
        _host.nap(1000.0 / 60.0)
        return False

    def resize(self, width: int, height: int) -> None:
        """Gives the display a new size; d.pixels becomes a new array (the overlapping part is kept),
        so take d.pixels again afterwards."""
        self._check_open()
        if self._vclosed:
            return
        w, h = _size(width, height)
        rc = int(_host.resize(self._id, w, h))
        if rc == _RC_VISITOR_CLOSED:
            self._visitor_close()
            return
        if rc <= 0:
            self._failed("resize()", rc)
        np = _numpy()
        old = self._pixels
        new = np.zeros((h, w, 4), dtype=np.uint8)
        new[..., 3] = 255
        mh, mw = min(h, self._h), min(w, self._w)
        new[:mh, :mw] = old[:mh, :mw]
        self._id = rc
        self._w = w
        self._h = h
        self._pixels = new
        self._ptr = _address(new)
        self._nbytes = int(new.nbytes)

    # --- input ------------------------------------------------------------------------------
    def _fetch(self) -> None:
        if self._vclosed:
            return
        if _HEAP_OK:
            n = int(_host.poll(self._id, self._evptr, _EV_CAP))
            if n == _RC_VISITOR_CLOSED:
                self._visitor_close()
            elif n < 0:
                self._failed("poll()", n)
            elif n > 0:
                self._queue.extend(_parse(self._evbuf.data, n))
        else:
            if int(_host.state(self._id)) == 2:
                self._visitor_close()
                return
            raw = _host_call(_host.poll_copy, self._id)
            data = raw.to_bytes() if hasattr(raw, "to_bytes") else bytes(raw)
            self._queue.extend(_parse(data, len(data) // _EV_BYTES))

    def poll(self):
        """Returns the events since the last call as a list (empty when there are none). Never waits."""
        self._check_open()
        self._fetch()
        out = list(self._queue)
        self._queue.clear()
        return out

    def wait_event(self, timeout=None):
        """Returns the next event, waiting up to `timeout` seconds (None: no limit); None on timeout."""
        self._check_open()
        if not self._queue:
            self._fetch()
        if not self._queue and not self._vclosed:
            ms = -1 if timeout is None else max(0.0, float(timeout) * 1000.0)
            rc = int(_host.wait_event(self._id, ms))
            if rc == _RC_VISITOR_CLOSED:
                self._visitor_close()
            elif rc < 0:
                self._failed("wait_event()", rc)
            elif rc == 1:
                self._fetch()
        return self._queue.popleft() if self._queue else None

    # --- closing ----------------------------------------------------------------------------
    def close(self) -> None:
        """Closes the window; the last frame stays visible on the page."""
        global _current
        if not self._closed:
            _host.close(self._id)
            self._closed = True
        if _current is self:
            _current = None

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __repr__(self) -> str:
        state = "closed" if self.closed else "open"
        return f"<vdisplay.Display {self._w}x{self._h} {self.title!r} {state}>"


class Clock:
    """Frame timer: dt = clock.tick(60) waits so the loop runs at most 60 times a second."""

    def __init__(self) -> None:
        self._last = None
        self._next = None
        self._dts = deque(maxlen=60)

    def tick(self, fps: float = 60) -> float:
        """Waits until 1/fps seconds after the last tick (fps None or 0: no wait); returns seconds since it."""
        import yotasage_host

        now = _now()
        if fps and fps > 0 and self._next is not None:
            if now < self._next:
                yotasage_host.sleep_interruptible(self._next - now)
                now = _now()
            period = 1.0 / float(fps)
            # Keep a steady rate, but do not try to catch up after a long frame.
            self._next = self._next + period if now - self._next < period else now + period
        elif fps and fps > 0:
            self._next = now + 1.0 / float(fps)
        dt = 0.0 if self._last is None else now - self._last
        if self._last is not None:
            self._dts.append(dt)
        self._last = now
        return dt

    def get_fps(self) -> float:
        """Frames per second over the last 60 ticks (0.0 before two ticks)."""
        total = sum(self._dts)
        return len(self._dts) / total if total > 0 else 0.0
