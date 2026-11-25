"""vdisplay: a pixel window for programs in the Python playground.

    import vdisplay as vd
    d = vd.Display(320, 240, title="Demo")
    d.pixels[..., 0] = 255          # NumPy uint8 array, shape (height, width, 4), RGBA
    d.present()                     # show the frame
    for ev in d.poll(): ...         # input since the last call
    d.wait_frame()                  # wait for the page's next frame
    clock = vd.Clock(); dt = clock.tick(60)

Only one window exists: a new Display closes the one before it (its ``closed`` becomes True).
Display needs Tier 1 (the page cross-origin isolated), where the program and the page share memory.
"""

import struct
from collections import deque

import yotasage_display as _host

__all__ = [
    "Clock",
    "Display",
    "DisplayError",
    "Event",
    "MAX_HEIGHT",
    "MAX_WIDTH",
    "MOD_ALT",
    "MOD_CTRL",
    "MOD_META",
    "MOD_SHIFT",
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
}
_SCALES = ("fit", "pixel")
# Frames and events go by address through the worker's view of wasm memory; without it (a Pyodide
# change), by buffer, with a Stop during the conversion turned back into KeyboardInterrupt.
_HEAP_OK = bool(_host.heap_ok)
_current = None


class DisplayError(RuntimeError):
    """The display cannot do what was asked (wrong tier, closed, bad size)."""


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


class Event:
    """One input event. Coordinates are display pixels; t is seconds since the epoch.

    type: "pointerdown", "pointerup", "pointermove", "wheel", "keydown" or "keyup".
    button: the pointer button that changed (0 left, 1 middle, 2 right); buttons: those held (bits).
    key / code: KeyboardEvent.key and .code ("a", "ArrowLeft" / "KeyA"); text: the character a key
    types ("" for keys that type nothing or with Ctrl/Meta held). mods: MOD_SHIFT | MOD_CTRL | ...
    dx, dy: wheel distance in pixels; repeat: True for a held key's repeats.
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
        if kind >= 5:
            key = bytes(buf[off + 44:off + 44 + min(klen, 32)]).decode("utf-8", "replace")
            code = bytes(buf[off + 76:off + 76 + min(clen, 20)]).decode("ascii", "replace")
            if kind == 5 and len(key) == 1 and not mods & (MOD_CTRL | MOD_META):
                text = key
        out.append(Event(name, x, y, button, buttons, key, code, text, mods, t / 1000.0, dx, dy, bool(rep)))
    return out


class Display:
    """A window of width x height RGBA pixels shown in the Display panel.

    scale: "fit" (fill the panel, keeping the shape), "pixel" (one display pixel per screen pixel)
    or a whole number 1..8 (that many screen pixels per display pixel).
    Sizes above MAX_WIDTH x MAX_HEIGHT (1920 x 1080) are reduced to it.
    """

    def __init__(self, width: int = 640, height: int = 480, title: str = "Display", scale="fit"):
        global _current
        _need_tier1()
        try:
            w = int(width)
            h = int(height)
        except (TypeError, ValueError):
            raise DisplayError("Display width and height must be whole numbers") from None
        if w < 1 or h < 1:
            raise DisplayError(f"Display size must be at least 1 x 1, not {w} x {h}")
        if scale not in _SCALES and not (isinstance(scale, int) and 1 <= scale <= 8):
            raise DisplayError('scale must be "fit", "pixel" or a whole number from 1 to 8')
        np = _numpy()
        w = min(w, MAX_WIDTH)
        h = min(h, MAX_HEIGHT)
        if _current is not None:
            _current._closed = True
        self._id = int(_host.open(w, h, _clean_title(title), scale))
        if self._id <= 0:
            raise DisplayError("The display could not be opened")
        _current = self
        self._closed = False
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
        """The frame being drawn: NumPy uint8 array, shape (height, width, 4), RGBA. Alpha starts at 255."""
        return self._pixels

    @pixels.setter
    def pixels(self, value) -> None:
        self._pixels[...] = value

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
        if not self._closed and int(_host.current()) != self._id:
            self._closed = True
        return self._closed

    @property
    def canvas(self):
        raise NotImplementedError(
            "Drawing commands (d.canvas) are not built yet; draw into d.pixels and call d.present()."
        )

    def _check_open(self) -> None:
        if self._closed:
            raise DisplayError("This display is closed (a newer Display replaced it, or close() was called)")

    def _failed(self, what: str, rc: int):
        if rc == -2:
            self._closed = True
            self._check_open()
        raise DisplayError(f"{what} failed (code {rc})")

    # --- frames -----------------------------------------------------------------------------
    def present(self) -> None:
        """Shows d.pixels. While the page is hidden, this waits so the loop runs at about 4 frames a second."""
        self._check_open()
        if _HEAP_OK:
            rc = _host.present(self._id, self._ptr, self._nbytes)
        else:
            rc = _host_call(_host.present_buffer, self._id, self._pixels.reshape(-1))
        if rc < 0:
            self._failed("present()", rc)

    def wait_frame(self) -> bool:
        """Waits for the page's next frame (returns True), or 0.1 s when the page draws none (False).

        Blocks while the page or the Display panel is hidden. Stop interrupts it.
        """
        self._check_open()
        rc = int(_host.wait_frame(self._id))
        if rc < 0:
            self._failed("wait_frame()", rc)
        return rc == 1

    # --- input ------------------------------------------------------------------------------
    def _fetch(self) -> None:
        if _HEAP_OK:
            n = int(_host.poll(self._id, self._evptr, _EV_CAP))
            if n < 0:
                self._failed("poll()", n)
            if n > 0:
                self._queue.extend(_parse(self._evbuf.data, n))
        else:
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
        if not self._queue:
            ms = -1 if timeout is None else max(0.0, float(timeout) * 1000.0)
            rc = int(_host.wait_event(self._id, ms))
            if rc < 0:
                self._failed("wait_event()", rc)
            if rc == 1:
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
