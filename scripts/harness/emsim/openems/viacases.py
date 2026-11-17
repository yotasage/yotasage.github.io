"""openEMS fixtures of step M6.4a: the vias of the tool's default setup (lib/emsim setup.ts defaultSetup(): JLCPCB
JLC061611-3313A with its masks, the C44 via preset, the C45 pair preset), docs/em-sim/notes-M6.4a.md.

  --case=c44        the C44 via (0.6/0.3 through L1-L6, pads on all six layers, antipads 1.8 on the planes L2 and L5,
                    two return vias 0.3/0.6 at y = +-0.8 joining the planes), feeds on L1 (-x) and L6 (+x)
  --case=c44-noret  the same without the return vias
  --case=c44-stub   exit on L3 (a stripline between L2 and L5 toward +x): the barrel below L3 is a 1.335 mm stub
  --case=c44-bd     the stub backdrilled from the bottom, 1.2 mm deep, drill 0.5 (examples.md example 5)
  --case=c45        the pair 0.5/0.22 at pitch 0.7 (y), pads on L1 and L6 only, stadium antipad 1.22 x 1.92 on L2 and
                    L5, six return vias 0.4/0.2; feeds of both barrels on L1 toward -x and on L6 toward +x
  --coarse          3 cells per drill instead of 6 (writes <id>-coarse.json)

Frame (engine.md section 1): the (first) barrel at x = y = 0, z up from the outer face of L6's copper. Barrels are solid
PEC cylinders of the drill diameter, staircased (6 cells per drill). Feeds are the rectangle of the trapezoid's mean
width (0.1377 - 0.00889), 50 ohm lumped ports at |x| = 4.5, probe planes (the reference planes) at |x| = 3.
Symmetric structures are solved from one excitation (common.fit_s with their symmetry); the asymmetric stub cases take
one run per port; the pair takes two runs (ports A1 and B6) whose misfit measures the symmetry.
"""
import sys

import numpy as np

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))  # python -I leaves it out
import common as cm  # noqa: E402
from common import ContinuousStructure, openEMS

CASE = cm.arg('case', 'c44', str)
COARSE = '--coarse' in sys.argv
THREADS = int(cm.arg('threads', 8))
T_MAX = cm.arg('maxtime_ps', 800) * 1e-12

# JLC061611-3313A as defaultSetup() reads it (finished copper t; lossless here)
CU = {'L1': (1.602, 1.637), 'L2': (1.480, 1.510), 'L3': (1.320, 1.350), 'L4': (0.287, 0.317), 'L5': (0.127, 0.157),
      'L6': (0.0, 0.035)}
DIEL = [('D1', 'prepreg 3313', 1.510, 1.602, 4.1), ('D2', 'core FR-4 (NP-155F)', 1.350, 1.480, 4.17),
        ('D3', 'prepreg 1080', 1.251, 1.320, 3.91), ('D4', 'core FR-4, etched bare (NP-155F)', 0.386, 1.251, 4.55),
        ('D5', 'prepreg 1080', 0.317, 0.386, 3.91), ('D6', 'core FR-4 (NP-155F)', 0.157, 0.287, 4.17),
        ('D7', 'prepreg 3313', 0.035, 0.127, 4.1)]
ZTOP = 1.637
ZMID = ZTOP / 2
ER_MASK, MASK_LAM, MASK_CU = 3.8, 0.03048, 0.01524
ETCH = 0.00889
W_DRAWN = 0.1377
W = W_DRAWN - ETCH  # the trapezoid's mean width (base 0.1377, top 0.11992)
YT = W / 2
X_END, AIR = 7.2, 2.4
X_PORT, X_MEAS = 4.5, 3.0
R_PORT = 50.0
TR = 35e-12
ALL6 = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']
# the 2D solver's lines (lib/emsim lines.ts solveSetup on defaultSetup(), the trapezoid with its mask), for the sanity
LINE2D = {'L1': (51.4976, 3.29814), 'L6': (51.4976, 3.29814), 'L3': (54.5922, 4.14366)}
# feed layer: (face toward the plane, far face, plane face, plane id)
FEED = {'L1': (1.602, 1.637, 1.510, 'L2'), 'L6': (0.035, 0.0, 0.127, 'L5'), 'L3': (1.350, 1.320, 1.480, 'L2')}

C44 = dict(drill=0.3, pitch=None, pads={l: 0.6 for l in ALL6}, planes=['L2', 'L5'], antipad=1.8, oblong=False,
           returns=[(0.0, 0.8), (0.0, -0.8)], retDrill=0.3, retPad=0.6, feeds=[('L1', -1), ('L6', 1)], backdrill=None)
CASES = {
    'c44': dict(C44, id='via-c44', case='C44', pattern=cm.SYM2, excite=[0],
                text='the C44 via of the default setup (0.6/0.3 through L1-L6, pads on all six layers, antipads 1.8 '
                     'on L2 and L5, two return vias 0.3/0.6 at y = +-0.8), 50R_SE feeds on L1 and L6'),
    'c44-noret': dict(C44, id='via-c44-noret', case='C44 without its return vias', returns=[], pattern=cm.SYM2,
                      excite=[0], text='the C44 via without return vias, feeds on L1 and L6'),
    'c44-stub': dict(C44, id='via-c44-stub', case='C44, exit on L3 (examples.md example 5 "stub")',
                     feeds=[('L1', -1), ('L3', 1)], pattern=cm.FULL2, excite=[0, 1],
                     text='the C44 via entering on L1 and leaving on L3 (a stripline between L2 and L5): an L3-L6 stub'),
    'c44-bd': dict(C44, id='via-c44-bd', case='C44, exit on L3, backdrilled (examples.md example 5 "backdrill")',
                   feeds=[('L1', -1), ('L3', 1)], backdrill=(1.2, 0.5), pattern=cm.FULL2, excite=[0, 1],
                   text='the C44 stub via backdrilled from the bottom, 1.2 mm deep, drill 0.5'),
    'c45': dict(id='via-c45', case='C45 (the pair preset)', drill=0.22, pitch=0.7, pads={'L1': 0.5, 'L6': 0.5},
                planes=['L2', 'L5'], antipad=1.22, oblong=True,
                returns=[(0.67, -0.47), (-0.67, -0.47), (0.0, -0.81), (0.67, 1.17), (-0.67, 1.17), (0.0, 1.51)],
                retDrill=0.2, retPad=0.4, feeds=[('L1', -1), ('L6', 1)], backdrill=None, pattern=cm.XOR4,
                excite=[0, 3], text='the C45 via pair of the default setup (0.5/0.22 at pitch 0.7, pads on L1 and L6 '
                'only, stadium antipad 1.22 x 1.92 on L2 and L5, six return vias 0.4/0.2), 50R_SE feeds of both '
                'barrels on L1 toward -x and on L6 toward +x'),
}
K = CASES[CASE]
NAME = K['id']
BARRELS = [(0.0, 0.0)] + ([(0.0, K['pitch'])] if K['pitch'] else [])
YC = (BARRELS[-1][1]) / 2  # the structure's mirror line in y
DRILL = K['drill']
FINE = DRILL / (3 if COARSE else 6)
# ports: for each feed, for each barrel (the pair: A1, B1, A6, B6)
PORTS = [(lay, d, by) for lay, d in K['feeds'] for _, by in BARRELS]


def mesh_lines():
    rd = DRILL / 2
    # in order of importance (sym_lines drops a later line within 15 um of an earlier one): barrels, the feeds'
    # thirds-rule lines, pads, antipads, the backdrill, the return vias
    core_x, core_y = [0, rd, K['pads'][max(K['pads'])] / 2, K['antipad'] / 2], []
    for bx, by in BARRELS:
        core_y += [by, by - rd, by + rd, by - YT + 0.01, by + YT - 0.01, by - YT - 0.02, by + YT + 0.02]  # thirds, d = 0.03
    for bx, by in BARRELS:
        for r in (K['antipad'] / 2,) + tuple(p / 2 for p in K['pads'].values()):
            core_y += [by - r, by + r]
    if K['backdrill']:
        core_x.append(K['backdrill'][1] / 2)
        core_y += [K['backdrill'][1] / 2, -K['backdrill'][1] / 2]
    for x, y in K['returns']:
        for r in (K['retDrill'] / 2, K['retPad'] / 2):
            core_x += [x - r, x + r]
            core_y += [y - r, y + r]
    ext = max([abs(v) for v in core_x] + [abs(v - YC) for v in core_y]) + 0.3
    core_x += [ext, -ext]
    core_y += [YC - ext, YC + ext]
    xs = cm.sym_lines([X_END, X_PORT, X_MEAS], 0.0, 0.15, fine=(FINE, core_x), merge=0.015)
    ys = cm.sym_lines([YC + ext + 2.6], YC, 0.15, fine=(FINE, core_y), merge=0.015)
    zf = [z for a in CU.values() for z in a] + [d[2] for d in DIEL] + [d[3] for d in DIEL]
    zf += list(np.linspace(0.035, 0.127, 5)[1:-1]) + list(np.linspace(1.510, 1.602, 5)[1:-1])
    zf += [-MASK_CU, ZTOP + MASK_CU, -AIR, ZTOP + AIR]
    if K['backdrill']:
        zf += [K['backdrill'][0], ZTOP - K['backdrill'][0]]
    zs = cm.sym_lines(zf, ZMID, 0.2, fine=(0.05, [z for z in zf if -0.1 < z < ZTOP + 0.1]))
    return xs, ys, zs, ext


def build(excite):
    fdtd = openEMS(NrTS=400000, EndCriteria=1e-5)
    fdtd.SetGaussExcite(0, cm.F_TOP)
    fdtd.SetMaxTime(T_MAX)
    fdtd.SetBoundaryCond(['PML_8'] * 6)
    csx = ContinuousStructure()
    fdtd.SetCSX(csx)
    mesh = csx.GetGrid()
    mesh.SetDeltaUnit(cm.UNIT)
    xs, ys, zs, _ = mesh_lines()
    mesh.AddLine('x', xs)
    mesh.AddLine('y', ys)
    mesh.AddLine('z', zs)
    x0, x1, y0, y1 = xs[0], xs[-1], ys[0], ys[-1]
    # dielectrics up to the middle of the inner copper layers; the outer copper sits in mask and air
    mats = {}
    for i, (did, _, za, zb, er) in enumerate(DIEL):
        m = csx.AddMaterial(did + '-' + str(i), epsilon=er)
        mats[did] = m
        lo = za if za == 0.035 else za - 0.015
        hi = zb if zb == 1.602 else zb + 0.015
        lo, hi = (za if za in (0.386, 1.251) else lo), (zb if zb in (0.386, 1.251) else hi)
        m.AddBox([x0, y0, lo], [x1, y1, hi], priority=1)
    mask = csx.AddMaterial('mask', epsilon=ER_MASK)
    mask.AddBox([x0, y0, 1.602], [x1, y1, 1.602 + MASK_LAM], priority=2)
    mask.AddBox([x0, y0, 0.035 - MASK_LAM], [x1, y1, 0.035], priority=2)
    below = {'L2': ('D2', 'D1'), 'L5': ('D7', 'D6')}  # plane: (dielectric below, above)
    cu = csx.AddMetal('copper')
    air = csx.AddMaterial('air', epsilon=1.0)
    rd = DRILL / 2
    for pid in K['planes']:
        za, zb = CU[pid]
        cu.AddBox([x0, y0, za], [x1, y1, zb], priority=10)
        r = K['antipad'] / 2
        for half, (h0, h1) in zip(below[pid], ((za, (za + zb) / 2), ((za + zb) / 2, zb))):
            m = mats[half]
            for bx, by in BARRELS:
                m.AddCylinder([bx, by, h0], [bx, by, h1], r, priority=20)
            if K['oblong']:
                m.AddBox([-r, 0, h0], [r, K['pitch'], h1], priority=20)
    for lay, d in K['pads'].items():
        za, zb = CU[lay]
        for bx, by in BARRELS:
            cu.AddCylinder([bx, by, za], [bx, by, zb], d / 2, priority=30)
            if lay in ('L1', 'L6'):
                zm0, zm1 = (zb, zb + MASK_CU) if lay == 'L1' else (za - MASK_CU, za)
                mask.AddCylinder([bx, by, zm0], [bx, by, zm1], d / 2 + MASK_CU, priority=3)
    for bx, by in BARRELS:
        cu.AddCylinder([bx, by, 0.0], [bx, by, ZTOP], rd, priority=30)
    for x, y in K['returns']:
        cu.AddCylinder([x, y, 0.0], [x, y, ZTOP], K['retDrill'] / 2, priority=30)
        for pid in K['planes']:
            cu.AddCylinder([x, y, CU[pid][0]], [x, y, CU[pid][1]], K['retPad'] / 2, priority=30)
    if K['backdrill']:
        depth, dd = K['backdrill']
        air.AddCylinder([0, 0, -0.5], [0, 0, depth], dd / 2, priority=40)
    probes = []
    for n, (lay, d, by) in enumerate(PORTS):
        face, far, plane, _ = FEED[lay]
        za, zb = sorted((face, far))
        xa, xb = sorted((0.0, d * X_PORT))
        cu.AddBox([xa, by - YT, za], [xb, by + YT, zb], priority=30)
        if lay in ('L1', 'L6'):
            zm0, zm1 = (zb, zb + MASK_CU) if lay == 'L1' else (za - MASK_CU, za)
            mask.AddBox([xa, by - YT - MASK_CU, zm0 if lay == 'L6' else za], [xb, by + YT + MASK_CU, zm1 if lay == 'L1' else zb], priority=3)
        cm.lumped_port(fdtd, n + 1, R_PORT, d * X_PORT, YT, plane, face, 1 if n == excite else 0, y_c=by)
        p = cm.ProbePort(csx, n + 1, YT, face, far, plane, d * X_MEAS, y_c=by)
        p.place(mesh, -d)
        probes.append(p)
    return fdtd, csx, mesh, probes


f = cm.F_GRID
N = len(PORTS)
runs, tails, run_s, stats, probes_of = [], [], 0.0, None, {}
for e in K['excite']:
    fdtd, csx, mesh, probes = build(e)
    msum = cm.mesh_summary(mesh)
    print('mesh', msum['cells'], msum['smallestCell_mm'], flush=True)
    path, s = cm.post_or_run(fdtd, csx, NAME + ('-coarse' if COARSE else '') + '-p%d' % (e + 1), THREADS)
    run_s += s
    stats = cm.run_stats(path)
    for p in probes:
        p.read(path, f)
    ab = [p.waves(50.0) for p in probes]
    runs.append((np.array([w[0] for w in ab]), np.array([w[1] for w in ab])))
    # the truncation: each probe's tail against the largest peak of the run (an undriven port's own peak is small)
    big = max(p.peak for p in probes)
    tails.append([p.tail_abs / big for p in probes])
    for n, p in enumerate(probes):  # each port's line from the run where its signal is largest
        if n not in probes_of or p.peak > probes_of[n].peak:
            probes_of[n] = p
dt_fdtd = stats.get('timestep (s)')
p0 = probes_of[0]
steps = int(round(p0.t_end / dt_fdtd)) if dt_fdtd else None
ZR = 50.0
S, resid = cm.fit_s(runs, K['pattern'])
band = (f >= 1e9) & (f <= 10e9)
top = (f >= 0.1e9) & (f <= cm.F_TOP)
k0 = 2 * np.pi * np.where(f > 0, f, np.nan) / cm.C0
with np.errstate(all='ignore'):
    eeff = [(np.real(probes_of[n].beta) / k0) ** 2 for n in range(N)]
zfeed = [float(np.mean(np.real(probes_of[n].z_line[band]))) for n in range(N)]
efeed = [float(np.mean(eeff[n][band])) for n in range(N)]
sv = cm.passivity(S)
recip = float(np.max(np.abs(S - np.transpose(S, (1, 0, 2)))[:, :, top])) if K['pattern'] is cm.FULL2 else 0.0
t_feed = 2 * X_MEAS * cm.UNIT * np.sqrt(efeed[0]) / cm.C0
results, sanity = {}, {}
keep = np.arange(0, len(f), 2)
if N == 2:
    s11, s12, s21, s22 = S[0, 0], S[0, 1], S[1, 0], S[1, 1]
    sp = {'s11': cm.cplx(s11[keep]), 's21': cm.cplx(s21[keep])}
    if K['pattern'] is cm.FULL2:
        sp.update({'s12': cm.cplx(s12[keep]), 's22': cm.cplx(s22[keep])})
    t, z = cm.tdr(s11, TR, ZR, t_after=200e-12)
    win = (t > t_feed - 30e-12) & (t < t_feed + 40e-12)
    with np.errstate(all='ignore'):
        A, B, C, D = cm.s2_to_abcd(s11, s12, s21, s22, ZR)
        fe = [cm.line_abcd(probes_of[n].z_line, probes_of[n].beta, X_MEAS * cm.UNIT) for n in range(2)]
        v = cm.abcd_mul(cm.abcd_mul(cm.abcd_inv(fe[0]), (A, B, C, D)), cm.abcd_inv(fe[1]))
    if K['pattern'] is cm.SYM2:
        with np.errstate(all='ignore'):
            zv = np.sqrt(v[1] / v[2])
            zv = np.where(np.real(zv) < 0, -zv, zv)
            tau = np.real(np.arccos((v[0] + v[3]) / 2)) / (2 * np.pi * f)
        zvia, tvia = float(np.mean(np.real(zv[band]))), float(np.mean(tau[band]))
        results['viaDeembedded'] = {
            'z_ohm': round(zvia, 3), 'delay_s': tvia, 'band_Hz': [1e9, 10e9], 'L_nH': round(zvia * tvia * 1e9, 4),
            'C_pF': round(tvia / zvia * 1e12, 4), 'how': 'feeds removed with their own Z and beta to the via axis; '
            'Z = sqrt(B/C), delay = acos((A + D)/2)/omega of the remaining ABCD (pads, barrel, joints)'}
    else:
        m21 = cm.db(s21)
        dip = (f >= 5e9) & (f <= cm.F_TOP)
        kd = int(np.argmin(np.where(dip, m21, np.inf)))
        k10 = int(np.argmin(np.abs(f - 10e9)))
        results['stub'] = {
            's21MinInBand_dB': round(float(m21[kd]), 3), 'fS21Min_Hz': float(f[kd]),
            's21At10GHz_dB': round(float(m21[k10]), 4), 's11At10GHz_dB': round(float(cm.db(s11)[k10]), 3),
            'deembeddedS21At10GHz_dB': round(float(cm.db(2 / (v[0][k10] + v[1][k10] / ZR + v[2][k10] * ZR + v[3][k10]))), 4),
            'how': 'from S at the reference planes (feeds included); the de-embedded S21 removes both feeds with their '
                   'own Z and beta (to the via axis) and is referred to 50 ohm'}
    results['tdr'] = {'port': 1, 'riseTime_s': TR, 'edge': 'Gaussian, 10-90 %, fullwave.md section 7.2', 'zRef_ohm': ZR,
                      'time': 'round trip, 0 = 50 % of the edge at the reference plane', 't_s': cm.rnd(t[::2], 6),
                      'z_ohm': cm.rnd(z[::2], 6),
                      'viaWindow': {'tViaAxis_s': t_feed, 'zMin_ohm': round(float(np.min(z[win])), 3),
                                    'zMax_ohm': round(float(np.max(z[win])), 3)}}
else:
    # the pair: S by the Klein symmetry (S_ij = p[i ^ j]); mixed mode with (A1, B1) and (A6, B6) as the pairs
    a, b, c, d = S[0, 0], S[1, 0], S[2, 0], S[3, 0]
    sp = {'s11': cm.cplx(a[keep]), 's21': cm.cplx(b[keep]), 's31': cm.cplx(c[keep]), 's41': cm.cplx(d[keep])}
    sdd11, sdd21, scc11, scc21 = a - b, c - d, a + b, c + d
    t, z = cm.tdr(sdd11, TR, 2 * ZR, t_after=200e-12)
    win = (t > t_feed - 30e-12) & (t < t_feed + 40e-12)
    results['mixedMode'] = {'sdd21At10GHz_dB': round(float(cm.db(sdd21)[np.argmin(np.abs(f - 10e9))]), 4),
                            'sdd11At10GHz_dB': round(float(cm.db(sdd11)[np.argmin(np.abs(f - 10e9))]), 3),
                            'scc21At10GHz_dB': round(float(cm.db(scc21)[np.argmin(np.abs(f - 10e9))]), 4),
                            'how': 'Sdd = (S of A minus S of B)/2 etc. with the pairs (A1, B1) on L1 and (A6, B6) on L6: '
                                   'Sdd11 = S11 - S21, Sdd21 = S31 - S41, Scc11 = S11 + S21, Scc21 = S31 + S41'}
    results['tdr'] = {'port': 'differential, pair (A1, B1)', 'riseTime_s': TR, 'edge': 'Gaussian, 10-90 %, '
                      'fullwave.md section 7.2', 'zRef_ohm': 2 * ZR, 'time': 'round trip, 0 = 50 % of the edge at the '
                      'reference plane', 't_s': cm.rnd(t[::2], 6), 'z_ohm': cm.rnd(z[::2], 6),
                      'viaWindow': {'tViaAxis_s': t_feed, 'zMin_ohm': round(float(np.min(z[win])), 3),
                                    'zMax_ohm': round(float(np.max(z[win])), 3)}}
pname = ['A1', 'B1', 'A6', 'B6'] if N == 4 else ['1', '2']
sym_text = {id(cm.SYM2): 'one excitation (port 1); S22 = S11 and S12 = S21 by the structure\'s symmetry (180 degree '
            'rotation about the y axis through the board centre) and reciprocity; the end ports\' mismatch drops out',
            id(cm.FULL2): 'one run per port, S = B A^-1 at every frequency (common.fit_s): the full 2-port',
            id(cm.XOR4): 'two runs (ports A1 and B6); S_ij = p[i xor j] by the two mirror symmetries (y about the pair\'s '
            'centre line, and the 180 degree rotation about the y axis that maps L1 onto L6), least squares over both '
            'runs (common.fit_s); stored: the first column, the rest by the pattern'}[id(K['pattern'])]
results['sParameters'] = dict({'zRef_ohm': ZR, 'ports': pname, 'pattern': K['pattern'], 'how': sym_text,
                               'referencePlanes': 'the ports\' x below (3 mm feeds included, not de-embedded)',
                               'f_Hz': cm.rnd(f[keep], 8)}, **sp)
results['feeds'] = {'f_Hz': cm.rnd(f[keep][1::5], 8),
                    'z_ohm': [cm.rnd(np.real(probes_of[n].z_line[keep][1::5]), 6) for n in range(N)],
                    'eeff': [cm.rnd(eeff[n][keep][1::5], 6) for n in range(N)],
                    'z_ohm_1to10GHz': [round(x, 4) for x in zfeed], 'eeff_1to10GHz': [round(x, 5) for x in efeed],
                    'how': 'each probe plane\'s Z = sqrt(E dE / (H dH)) and beta (from the run where its signal is largest)'}
ref = [LINE2D[lay] for lay, _, _ in PORTS]
sanity = {
    'feedsVs2D': [{'port': pname[n], 'layer': PORTS[n][0], 'z2d_ohm': ref[n][0], 'eeff2d': ref[n][1],
                   'dz': round(zfeed[n] / ref[n][0] - 1, 5), 'deeff': round(efeed[n] / ref[n][1] - 1, 5)}
                  for n in range(N)],
    'feedsVs2DNote': 'the 2D solver (lines.ts) on the trapezoid (base 0.1377, top 0.11992) with its mask; openEMS has '
                     'the rectangle of the mean width; bars |dz| <= 4 % (openEMS reads the feeds about 3.4 % high on this mesh, 27 um cells across the trace by the thirds rule; msl-c39 at 15 um read 1.45 % low), |deeff| <= 3 %',
    'passivityMax': round(float(np.max(sv[top])), 6),
    'reciprocityMax': recip,
    'symmetryResidualMax': round(float(np.max(resid[top])), 6),
    'probeTailMax': float(np.max(tails)),
    'bars': {'passivityMax': 1.01, 'reciprocityMax': 0.01, 'symmetryResidualMax': 0.02, 'probeTailMax': 1e-3,
             'feed_dz': 0.04, 'feed_deeff': 0.03, 'band_Hz': [0.1e9, cm.F_TOP]},
}
if CASE == 'c44-stub':
    sanity['model'] = 'examples.md example 5 (quasi-static model, 2 mm feed): S21 dip -48.6 dB at 21.8 GHz; at 10 GHz S21 -0.67 dB, S11 -8.4 dB'
if CASE == 'c44-bd':
    sanity['model'] = 'examples.md example 5 (quasi-static model): at 10 GHz S21 -0.07 dB, S11 -18.1 dB'
msum['notes'] = ('x, y: at most %.4f (%d cells per drill) over the via block (pads, antipads, returns, backdrill), '
                 'graded 1.3 to 0.15; a line within 15 um of a more important one left out (sym_lines merge); y: thirds rule at the feed edges (0.01 inside, 0.02 outside); z: lines on every '
                 'copper and dielectric face and on the masks over copper, 4 cells in the 0.092 prepregs, at most '
                 '0.05 in the board, graded to 0.2 in the air; every axis mirror-symmetric about the structure\'s '
                 'centre (x = 0, y = %.3g, z = %.4f); no line on the mask over laminate (4.5 um from the copper '
                 'face; material averaging)' % (FINE, round(DRILL / FINE), YC, ZMID))
fx = {
    'format': 'emsim-openems-fixture', 'formatVersion': 1, 'id': NAME + ('-coarse' if COARSE else ''),
    'description': 'openEMS: ' + K['text'] + ', default stackup JLC061611-3313A with masks' + (' (coarse mesh)' if COARSE else ''),
    'case': K['case'],
    'structure': {
        'kind': 'via', 'units': 'mm',
        'frame': 'first barrel at x = y = 0 (the pair\'s second at y = %g); z up from the outer face of L6\'s copper' % (K['pitch'] or 0),
        'stackup': ([{'id': 'MT', 'kind': 'mask', 'er': ER_MASK, 'tand': 0, 'onLaminate': MASK_LAM, 'overCopper': MASK_CU}]
                    + sorted([{'id': l, 'kind': 'copper', 'z0': a, 'z1': b2, **({'role': 'plane'} if l in K['planes'] else {})}
                              for l, (a, b2) in CU.items()] + [{'id': i, 'kind': 'dielectric', 'material': mtl, 'z0': a, 'z1': b2,
                              'er': er, 'tand': 0} for i, mtl, a, b2, er in DIEL], key=lambda r: -r['z0'])
                    + [{'id': 'MB', 'kind': 'mask', 'er': ER_MASK, 'tand': 0, 'onLaminate': MASK_LAM, 'overCopper': MASK_CU}]),
        'via': {'barrels': [list(b2) for b2 in BARRELS], 'drill': DRILL, 'barrel': 'solid PEC cylinder of the drill '
                'diameter from z = 0 to %g' % ZTOP, 'from': 'L1', 'to': 'L6', 'exit': PORTS[-1][0],
                'pads': K['pads'], 'planes': K['planes'],
                'antipads': {l: {'d': K['antipad'], 'shape': 'oblong (stadium over the pitch)' if K['oblong'] else 'round'}
                             for l in K['planes']},
                'backdrill': {'side': 'bottom', 'depth': K['backdrill'][0], 'd': K['backdrill'][1],
                              'what': 'air from below the bottom mask to z = depth: barrel, pads and mask removed'} if K['backdrill'] else None},
        'returnVias': [{'x': x, 'y': y, 'drill': K['retDrill'], 'barrel': 'z 0 to %g' % ZTOP,
                        'pads': {l: K['retPad'] for l in K['planes']}} for x, y in K['returns']],
        'feeds': [{'port': pname[n], 'layer': lay, 'over': FEED[lay][3], 'width': W, 'drawnWidth': W_DRAWN,
                   'etch': 'rectangle of the mean width', 'y': by, 'from': [0, by], 'to': [d * X_PORT, by],
                   'referencePlaneDistance': X_MEAS, 'mask': lay != 'L3'} for n, (lay, d, by) in enumerate(PORTS)],
        'domain': {'x': [float(xs0) for xs0 in (mesh.GetLines('x')[0], mesh.GetLines('x')[-1])],
                   'y': [float(v0) for v0 in (mesh.GetLines('y')[0], mesh.GetLines('y')[-1])],
                   'z': [float(v0) for v0 in (mesh.GetLines('z')[0], mesh.GetLines('z')[-1])],
                   'note': 'planes, laminate and masks run into the PML on the four sides'},
    },
    'openems': cm.openems_info(),
    'mesh': dict(msum, barrels='staircase (openEMS default, no conformal option): %d cells per drill, lines on the '
                 'drill edges; pads, antipads, return vias and the backdrill on lines at their edges where they '
                 'cross the axes, staircased elsewhere' % round(DRILL / FINE), timestep_s=dt_fdtd, probeSampling_s=p0.dt),
    'excitation': {'kind': 'gauss', 'f0_Hz': 0, 'fc_minus20dB_Hz': cm.F_TOP, 'ports': [pname[e] for e in K['excite']],
                   'source': 'openEMS LumpedPort (R %g ohm, soft E source in its edges), one run per excited port' % R_PORT},
    'run': {'endCriterion_dB': -50, 'maxTime_s': T_MAX, 'probeTailRelative': tails, 'steps': steps,
            'runs': len(K['excite']), 'simulatedTime_s': p0.t_end, 'openemsStats': stats},
    'ports': [{'number': n + 1, 'name': pname[n], 'layer': lay, 'kind': 'lumped port R %g ohm at x = %g, y = %g; waves '
               'from a probe plane (voltage at 3 x lines, current loop around the whole copper section)' % (R_PORT, d * X_PORT, by),
               'referencePlane_x': probes_of[n].x_meas_actual, 'excited': n in K['excite']}
              for n, (lay, d, by) in enumerate(PORTS)],
    'results': results,
    'sanity': sanity,
    'provenance': cm.provenance('viacases.py', run_s, THREADS),
}
fx['provenance']['runTime_s'], post = cm.earlier_run_time(fx['id'], run_s)
if post:
    fx['provenance']['postProcessedAgain'] = 'from the same run' + chr(39) + 's probe files (--post): S, lines and sanity re-made by the scripts named'
cm.write_fixture(fx['id'], fx)
extra = results.get('viaDeembedded') or results.get('stub') or results.get('mixedMode')
print('RESULT %s: feeds Z %s eeff %s | passivity %.5f recip %.2e sym %.2e tail %.1e | %s | %d cells, %s steps x %d, '
      'dt %s, run %.1f s' % (fx['id'], [round(x, 3) for x in zfeed], [round(x, 4) for x in efeed],
                             sanity['passivityMax'], recip, sanity['symmetryResidualMax'], sanity['probeTailMax'],
                             {k: v for k, v in extra.items() if k != 'how'}, msum['cells']['total'], steps,
                             len(K['excite']), dt_fdtd, run_s))
