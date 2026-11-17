"""Shared helper of the openEMS fixture scripts (step M0.4b, docs/em-sim/fullwave.md section 14).

Run by run.mjs with the openEMS venv's Python; CSXCAD_INSTALL_PATH must point at the openEMS folder before
CSXCAD is imported (run.mjs sets it). openEMS is GPL and lives only on the owner's PC: nothing here is shipped.

Units: the CSX drawing unit is 1 mm (mesh.SetDeltaUnit(1e-3)); every length in this file is in mm.
"""
import datetime
import json
import os
import subprocess
import tempfile
import time

import numpy as np

from CSXCAD import ContinuousStructure  # noqa: F401  (re-exported for the scripts)
from openEMS import openEMS  # noqa: F401
import openEMS as openEMS_pkg

C0 = 299792458.0
UNIT = 1e-3  # mm
OPENEMS_PACKAGE = 'openEMS_x64_v0.37.0_msvc'
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')

# One DFT grid for everything: 50 MHz steps to 40 GHz. S-parameters are kept every second point (100 MHz),
# the TDR uses the whole grid (window 1/50 MHz = 20 ns, far longer than any run, so no wrap-around).
DF = 50e6
F_TOP = 40e9
F_GRID = np.arange(0, int(round(F_TOP / DF)) + 1) * DF


def arg(name, default, cast=float):
    """Command-line option --name=value (for trial runs: --threads, --maxtime_ps)."""
    import sys
    for a in sys.argv[1:]:
        if a.startswith('--%s=' % name):
            return cast(a.split('=', 1)[1])
    return default


def sim_dir(name):
    return os.path.join(tempfile.gettempdir(), 'emsim-openems', name)


def smooth(mesh, axis, fixed, max_res, ratio=1.3):
    """Fixed lines plus openEMS's smoothing (cells at most max_res, neighbour ratio at most `ratio`)."""
    mesh.AddLine(axis, np.unique(np.round(np.asarray(fixed, float), 9)))
    mesh.SmoothMeshLines(axis, max_res, ratio)


def mesh_summary(mesh, pml_cells=8):
    out = {'cells': {}, 'smallestCell_mm': {}, 'largestCell_mm': {}}
    total = 1
    for a in 'xyz':
        lines = np.asarray(mesh.GetLines(a))
        d = np.diff(lines)
        out['cells'][a] = int(len(d))
        out['smallestCell_mm'][a] = round(float(d.min()), 6)
        out['largestCell_mm'][a] = round(float(d.max()), 6)
        r = d[1:] / d[:-1]
        out.setdefault('largestNeighbourRatio', 0)
        out['largestNeighbourRatio'] = round(max(out['largestNeighbourRatio'], float(np.max(np.maximum(r, 1 / r)))), 3)
        total *= len(d)
    out['cells']['total'] = int(total)
    out['pml'] = '%d-cell PML inside the domain on every open side' % pml_cells
    out['pmlThickness_mm'] = {}
    for a in 'xyz':
        d = np.diff(np.asarray(mesh.GetLines(a)))
        out['pmlThickness_mm'][a] = [round(float(d[:pml_cells].sum()), 4), round(float(d[-pml_cells:].sum()), 4)]
    return out


class ProbePort:
    """A microstrip port as openEMS's MSLPort, but for a trace of finite thickness.

    MSLPort puts its current probes around a zero-thickness sheet at the trace's lower face, which misses the current
    of a thick trace; here the current loop encloses the whole copper cross-section (y over the width, z over the
    thickness). Three voltage probes (plane to trace at the centre line) on the mesh lines around the measurement
    plane and two current probes between them give the total voltage and current at the plane, the line's own
    impedance sqrt(E dE / (H dH)) and its propagation constant beta (same post-processing as MSLPort.ReadUIData).

    x is the propagation axis, z the excitation axis. `x_outer` is the end of the line in the PML, `x_meas` the
    measurement (reference) plane; the excitation (soft E source, plane to trace, like MSLPort) sits at `x_exc`.
    """

    def __init__(self, csx, number, y_half, z_face, z_far, z_plane, x_meas, x_exc=None, y_c=0.0):
        self.number = number
        self.y_c = y_c            # the trace's centre line (y)
        self.direction = 1.0  # set in place(), sign of the way into the structure
        self.y_half = y_half
        self.z_face = z_face      # copper face toward the plane
        self.z_far = z_far        # opposite copper face
        self.z_plane = z_plane    # plane face toward the trace
        self.x_meas = x_meas
        self.x_exc = x_exc
        self.csx = csx

    def place(self, mesh, inward):
        """Add probes and excitation on the existing x lines. `inward` = +1 if the structure lies at larger x."""
        self.direction = float(inward)
        xl = np.asarray(mesh.GetLines('x'))
        k = int(np.argmin(np.abs(xl - self.x_meas)))
        idx = [k - 1, k, k + 1] if inward > 0 else [k + 1, k, k - 1]
        xu = xl[idx]
        self.x_meas_actual = float(xl[k])
        self.U_delta = np.diff(xu)
        self.u_names, self.i_names = [], []
        for n, x in enumerate(xu):
            name = 'port_ut%d%s' % (self.number, 'ABC'[n])
            p = self.csx.AddProbe(name, p_type=0)
            p.AddBox([x, self.y_c, self.z_face], [x, self.y_c, self.z_plane])
            self.u_names.append(name)
        xi = xu[:2] + np.diff(xu) / 2
        self.I_delta = np.diff(xi)
        zlo, zhi = sorted([self.z_face, self.z_far])
        for n, x in enumerate(xi):
            name = 'port_it%d%s' % (self.number, 'AB'[n])
            p = self.csx.AddProbe(name, p_type=1, weight=self.direction, norm_dir=0)
            p.AddBox([x, self.y_c - self.y_half, zlo], [x, self.y_c + self.y_half, zhi])
            self.i_names.append(name)
        if self.x_exc is not None:
            ke = int(np.argmin(np.abs(xl - self.x_exc)))
            self.x_exc_actual = float(xl[ke])
            sign = np.sign(self.z_plane - self.z_face)  # E from trace to plane: trace positive
            exc = self.csx.AddExcitation('port_excite_%d' % self.number, exc_type=0, exc_val=[0, 0, sign])
            exc.AddBox([xl[ke], self.y_c - self.y_half, self.z_face], [xl[ke], self.y_c + self.y_half, self.z_plane])

    def read(self, path, freq):
        def load(name):
            d = np.loadtxt(os.path.join(path, name), comments='%')
            return d[:, 0], d[:, 1]
        u = [load(n) for n in self.u_names]
        i = [load(n) for n in self.i_names]
        self.dt = float(u[0][0][1] - u[0][0][0])
        v = np.abs(u[1][1])
        self.peak = float(np.max(v))
        self.tail_abs = float(np.max(v[int(0.9 * len(v)):]))
        self.tail = self.tail_abs / self.peak  # truncation: last 10 % against the peak
        self.t_end = float(u[0][0][-1])
        U = [dft(t, v, freq) for t, v in u]
        I = [dft(t, v, freq) for t, v in i]
        self.U, self.I = U, I
        self.uf, self.if_, self.z_line, self.beta = line_of(U, I, self.U_delta, self.I_delta)
        return self

    def waves(self, zr):
        a = 0.5 * (self.uf + zr * self.if_)
        b = self.uf - a
        return a, b


def line_of(U, I, U_delta, I_delta):
    """Voltage and current at the plane, the line's own Z = sqrt(E dE / (H dH)) and beta from the DFTs of the three
    voltage and two current probes of a probe plane (MSLPort.ReadUIData); also for modal sums of several planes."""
    uf = U[1]
    if_ = 0.5 * (I[0] + I[1])
    with np.errstate(all='ignore'):
        dE = (U[2] - U[0]) / (np.sum(np.abs(U_delta)) * UNIT)
        dH = (I[1] - I[0]) / (np.abs(I_delta[0]) * UNIT)
        beta = np.sqrt(-dE * dH / (if_ * uf))
        beta[np.real(beta) < 0] *= -1
        z_line = np.sqrt(uf * dE / (if_ * dH))
    return uf, if_, z_line, beta


def dft(t, v, freq):
    """Single-sided DFT of a probe signal (as openEMS.utilities.DFT_time2freq), vectorised in blocks."""
    out = np.empty(len(freq), complex)
    dt = t[1] - t[0]
    for s in range(0, len(freq), 64):
        f = freq[s:s + 64, None]
        out[s:s + 64] = 2 * dt * np.exp(-2j * np.pi * f * t[None, :]) @ v
    return out


def tdr(gamma, tr, zr, t_before=40e-12, t_after=None):
    """fullwave.md section 7.2: Gamma on F_GRID times the Gaussian edge of 10-90 % rise tr, inverse FFT, cumulative
    sum = step response rho(t); Z = zr (1 + rho) / (1 - rho). Time 0 is the edge's 50 % point at the reference
    plane (round-trip time). Returns t (s) and Z (ohm) with a 1 ps step."""
    sig = tr / 2.563
    g = gamma * np.exp(-(2 * np.pi * F_GRID * sig) ** 2 / 2)
    g[0] = np.real(g[0])
    n = int(round(1 / (DF * 1e-12)))  # 1 ps samples
    h = np.fft.irfft(g, n)
    shift = int(round(t_before / 1e-12))
    h = np.roll(h, shift)
    rho = np.cumsum(h)
    t = (np.arange(n) - shift) * 1e-12
    keep = t <= (t_after if t_after is not None else 1e-9)
    z = zr * (1 + rho[keep]) / (1 - rho[keep])
    return t[keep], z


def rnd(a, digits=6):
    return [None if not np.isfinite(x) else float('%.*g' % (digits, x)) for x in np.asarray(a, float)]


def cplx(a, digits=6):
    a = np.asarray(a)
    return {'re': rnd(np.real(a), digits), 'im': rnd(np.imag(a), digits)}


def git_state():
    try:
        commit = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=REPO, text=True).strip()
        # modified or untracked scripts (the fixtures themselves are left out: re-making them changes them)
        st = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all', '--',
                                      'scripts/harness/emsim/openems/*.py', 'scripts/harness/emsim/openems/run.mjs'],
                                     cwd=REPO, text=True)
        dirty = bool(st.strip())
        return commit, dirty
    except Exception:
        return None, None


def run(fdtd, csx, name, threads=16):
    path = sim_dir(name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    t0 = time.time()
    fdtd.Run(path, cleanup=True, numThreads=threads, verbose=1, dump_statistics=True)
    return path, time.time() - t0


def run_stats(path):
    """openEMS_stats.txt of dump_statistics: lines 'value	% name', e.g. 'timestep (s)', 'number of iterations'."""
    out = {}
    p = os.path.join(path, 'openEMS_stats.txt')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8', errors='replace'):
            v, _, k = line.partition('%')
            try:
                out[k.strip()] = float(v.strip())
            except ValueError:
                pass
    return out


def lumped_port(fdtd, number, R, x, y_half, z_plane, z_face, excite, y_c=0.0):
    """Resistive lumped port (fullwave.md section 6) across the trace's end: z edges from the plane to the trace,
    in parallel over the width. openEMS's LumpedPort: R in the edges, the source as a soft E term in the same
    edges, trace positive for excite = 1."""
    return fdtd.AddLumpedPort(number, R, [x, y_c - y_half, z_plane], [x, y_c + y_half, z_face], 'z', excite, priority=5)


def provenance(script, run_s, threads):
    commit, dirty = git_state()
    return {
        'script': 'scripts/harness/emsim/openems/' + script,
        'gitCommit': commit,
        'scriptsChangedSinceCommit': dirty,
        'date': datetime.date.today().isoformat(),
        'runTime_s': round(run_s, 1),
        'threads': threads,
        'machine': 'owner PC, Ryzen 9 7950X (16 cores), Windows 11',
        'scriptSha256': {n: sha256_of(n) for n in (script, 'common.py')},
    }


def post_or_run(fdtd, csx, name, threads):
    """--post: read the probe files a previous run left in the temp folder instead of running openEMS again (for a
    change in the post-processing only); the run time is then 0 here and taken from the earlier fixture."""
    import sys
    if '--post' in sys.argv:
        path = sim_dir(name)
        if not os.path.exists(os.path.join(path, 'openEMS_stats.txt')):
            raise SystemExit('--post: no earlier run in %s' % path)
        return path, 0.0
    return run(fdtd, csx, name, threads)


def earlier_run_time(fixture_id, run_s):
    import sys
    if '--post' not in sys.argv:
        return round(run_s, 1), False
    with open(os.path.join(FIXTURES, fixture_id + '.json'), encoding='utf-8') as f:
        return round(json.load(f)['provenance']['runTime_s'], 1), True


def sha256_of(name):
    import hashlib
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), name), 'rb') as f:
        return hashlib.sha256(f.read().replace(bytes([13, 10]), bytes([10]))).hexdigest()


def openems_info():
    return {
        'version': openEMS_pkg.__version__,
        'package': OPENEMS_PACKAGE + ' (github.com/thliebig/openEMS-Project/releases/tag/v0.37.0)',
        'path': r'C:\Users\Jonat\opt\openEMS',
        'interface': 'Python 3.14 wheels of the release, venv C:\\Users\\Jonat\\opt\\openEMS-venv',
        'engine': 'default (multithreaded), material averaging on, lossless here',
    }


def write_fixture(name, obj):
    os.makedirs(FIXTURES, exist_ok=True)
    p = os.path.join(FIXTURES, name + '.json')
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('fixture %s: %.1f kB' % (p, os.path.getsize(p) / 1024))
    return p


def sym_s(a1, b1, a2, b2):
    """S11 and S21 of a reciprocal, symmetric two-port (S22 = S11, S12 = S21) from one excitation:
    b1 = S11 a1 + S21 a2, b2 = S21 a1 + S11 a2. Uses the waves arriving back from the far termination (a2), so the
    mismatch of the 50 ohm end ports against the line's own impedance drops out."""
    det = a1 * a1 - a2 * a2
    return (b1 * a1 - b2 * a2) / det, (b2 * a1 - b1 * a2) / det


def s_to_abcd(s11, s21, zr):
    """ABCD of a symmetric reciprocal two-port (S22 = S11) with reference impedance zr."""
    d = 2 * s21
    A = ((1 + s11) * (1 - s11) + s21 * s21) / d
    B = zr * ((1 + s11) * (1 + s11) - s21 * s21) / d
    C = ((1 - s11) * (1 - s11) - s21 * s21) / (zr * d)
    return A, B, C, A


def line_abcd(z, beta, length_m):
    th = beta * length_m
    return np.cos(th), 1j * z * np.sin(th), 1j * np.sin(th) / z, np.cos(th)


def abcd_mul(m1, m2):
    a1, b1, c1, d1 = m1
    a2, b2, c2, d2 = m2
    return a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2


def abcd_inv(m):
    a, b, c, d = m
    det = a * d - b * c
    return d / det, -b / det, -c / det, a / det


# --- Added by step M6.4a (several runs, N ports, symmetric meshes) ---

XOR4 = [[i ^ j for j in range(4)] for i in range(4)]  # S of a 4-port with two mirror symmetries (Klein group)
FULL2 = [[0, 1], [2, 3]]
SYM2 = [[0, 1], [1, 0]]


def fit_s(runs, pattern):
    """S of an N-port from one or more excitations: runs = [(a, b)], a and b of shape (N, F) (the waves at the probe
    planes), pattern[i][j] = the index of the unknown that S_ij equals (symmetry; FULL for none). Least squares per
    frequency over every run's b = S a; the end ports' reflections (a at the undriven ports) drop out. Returns S
    (N, N, F) and the relative residual per frequency (0 when exactly determined; else the symmetry's misfit)."""
    N = len(pattern)
    P = max(max(r) for r in pattern) + 1
    F = runs[0][0].shape[1]
    G = np.zeros((N, N, P))
    for i in range(N):
        for j in range(N):
            G[i, j, pattern[i][j]] = 1
    M = np.concatenate([np.einsum('ijp,jf->fip', G, a) for a, _ in runs], axis=1)  # (F, rows, P)
    y = np.concatenate([b.T for _, b in runs], axis=1)                              # (F, rows)
    S = np.zeros((N, N, F), complex)
    res = np.zeros(F)
    for k in range(F):
        p = np.linalg.lstsq(M[k], y[k], rcond=None)[0]
        r = M[k] @ p - y[k]
        res[k] = np.linalg.norm(r) / max(np.linalg.norm(y[k]), 1e-300)
        S[:, :, k] = np.einsum('ijp,p->ij', G, p)
    return S, res


def passivity(S):
    """Largest singular value of S per frequency (lossless and radiating: at most 1)."""
    return np.array([np.linalg.svd(S[:, :, k], compute_uv=False)[0] for k in range(S.shape[2])])


def s2_to_abcd(s11, s12, s21, s22, zr):
    d = 2 * s21
    A = ((1 + s11) * (1 - s22) + s12 * s21) / d
    B = zr * ((1 + s11) * (1 + s22) - s12 * s21) / d
    C = ((1 - s11) * (1 - s22) - s12 * s21) / (zr * d)
    D = ((1 - s11) * (1 + s22) + s12 * s21) / d
    return A, B, C, D


def sym_lines(fixed, centre, max_res, ratio=1.3, fine=None, merge=0.0):
    """Mesh lines mirror-symmetric about `centre`: the fixed lines (both halves given or not) smoothed by openEMS's
    SmoothMeshLines on a scratch grid, then the half above the centre mirrored. `fine` = (max_res_core, core_lines):
    the core lines are smoothed to the finer size first (as via.py's block around the barrels); core lines closer than
    `merge` to an earlier one (list the important ones first) are left out, so no tiny cell sets the time step."""
    g = ContinuousStructure().GetGrid()
    f = np.asarray(fixed, float)
    f = np.concatenate([f, 2 * centre - f, [centre]])
    if fine is not None:
        res0, core = fine
        c = []  # in the given order, each with its mirror; a line within `merge` of an earlier one is left out
        for v in [centre] + [w for u in core for w in (u, 2 * centre - u)]:
            if all(abs(v - u) >= merge for u in c):
                c.append(v)
        c = np.unique(np.round(c, 9))
        g.AddLine('x', c)
        g.SmoothMeshLines('x', res0, ratio)
        f = np.concatenate([f, np.asarray(g.GetLines('x'))])
        g = ContinuousStructure().GetGrid()
    g.AddLine('x', np.unique(np.round(f, 9)))
    g.SmoothMeshLines('x', max_res, ratio)
    L = np.asarray(g.GetLines('x'))
    hi = L[L >= centre - 1e-9]
    out = np.unique(np.round(np.concatenate([hi, 2 * centre - hi]), 9))
    return out


def db(x):
    with np.errstate(all='ignore'):
        return 20 * np.log10(np.abs(x))
