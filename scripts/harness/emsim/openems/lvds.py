"""openEMS fixture of step M6.4a: the owner's LVDS_100R pair, case C41 (docs/em-sim/facts-cases.md), as the tool's
'pair-microstrip' on the default stackup: two traces of w 0.11 (trapezoid, base 0.11 on the laminate, top 0.09222)
with an edge gap of 0.2 at the base on L1 over L2, JLCPCB mask (30.48 um on laminate and between the traces, 15.24 um
over copper and its sides, er 3.8), prepreg 3313 of 0.092 at er 4.1, lossless.

Frame: x along the lines, y across (the pair's centre at y = 0, P at +y, N at -y), z up with z = 0 at the top face of
L2, the reference plane, which is the PEC boundary at the bottom of the domain. Four 50 ohm lumped ports at x = -8
(P1, N1) and 8 (P2, N2); probe planes (the reference planes) at x = -5 and 5. One run (port P1 driven) gives the whole
4-port by the two mirror symmetries (y -> -y, x -> -x): S_ij = p[i xor j] in the port order P1, N1, P2, N2.
The modal lines come from the probe planes' sums: differential V = V_P - V_N, I = (I_P - I_N)/2 (Zdiff); common
V = (V_P + V_N)/2, I = I_P + I_N (Zcm). Writes fixtures/msl-c41.json. Usage: python lvds.py [--coarse]
"""
import sys

import numpy as np

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))  # python -I leaves it out
import common as cm  # noqa: E402
from common import ContinuousStructure, openEMS

NAME = 'msl-c41'
COARSE = '--coarse' in sys.argv
W, S_GAP, T, H, ETCH = 0.11, 0.2, 0.035, 0.092, 0.00889
WT = W - 2 * ETCH
YC = (S_GAP + W) / 2  # each trace's centre line
ER_SUB = 4.1
ER_MASK, MASK_LAM, MASK_CU = 3.8, 0.03048, 0.01524
X_END, X_PORT, X_MEAS = 9.6, 8.0, 5.0
Y_END, Z_TOP = 2.6, 2.4
R_PORT = 50.0
TR = 35e-12
THREADS = int(cm.arg('threads', 8))
T_MAX = cm.arg('maxtime_ps', 800) * 1e-12
# the 2D solver (lines.ts solveSetup, defaultSetup() with presetStructure('pair-microstrip', w 0.11), s 0.2)
ZDIFF_2D, ZCM_2D = 103.3643, 30.9075

fdtd = openEMS(NrTS=400000, EndCriteria=1e-5)
fdtd.SetGaussExcite(0, cm.F_TOP)
fdtd.SetMaxTime(T_MAX)
fdtd.SetBoundaryCond(['PML_8', 'PML_8', 'PML_8', 'PML_8', 'PEC', 'PML_8'])
csx = ContinuousStructure()
fdtd.SetCSX(csx)
mesh = csx.GetGrid()
mesh.SetDeltaUnit(cm.UNIT)

fine = 0.03 if COARSE else 0.015
ycore = [0]
for c in (YC,):
    ycore += [c - W / 2, c + W / 2, c - WT / 2, c + WT / 2, c - W / 2 - MASK_CU, c + W / 2 + MASK_CU]
ycore += [YC + W / 2 + 0.3]
mesh.AddLine('y', cm.sym_lines([Y_END], 0.0, 0.15, fine=(fine, ycore)))
mesh.AddLine('z', [0, H, H + MASK_LAM, H + T, H + T + MASK_CU])
mesh.SmoothMeshLines('z', H / 4, 1.3)
cm.smooth(mesh, 'z', [Z_TOP], 0.15)
mesh.AddLine('x', cm.sym_lines([X_END, X_PORT, X_MEAS], 0.0, 0.1))

sub = csx.AddMaterial('prepreg', epsilon=ER_SUB)
sub.AddBox([-X_END, -Y_END, 0], [X_END, Y_END, H], priority=1)
mask = csx.AddMaterial('mask', epsilon=ER_MASK)
mask.AddBox([-X_END, -Y_END, H], [X_END, Y_END, H + MASK_LAM], priority=2)
cu = csx.AddMetal('copper')
for sgn in (1, -1):
    c = sgn * YC
    mask.AddBox([-X_END, c - W / 2 - MASK_CU, H], [X_END, c + W / 2 + MASK_CU, H + T + MASK_CU], priority=3)
    # the trapezoid as an extruded polygon in (y, z), along x
    cu.AddLinPoly([[c - W / 2, c + W / 2, c + WT / 2, c - WT / 2], [H, H, H + T, H + T]], 'x', -X_PORT, 2 * X_PORT,
                  priority=10)
# ports P1, N1 (x = -8), P2, N2 (x = 8)
PORTS = [(-1, YC), (-1, -YC), (1, YC), (1, -YC)]
pname = ['P1', 'N1', 'P2', 'N2']
probes = []
for n, (d, c) in enumerate(PORTS):
    cm.lumped_port(fdtd, n + 1, R_PORT, d * X_PORT, W / 2, 0.0, H, 1 if n == 0 else 0, y_c=c)
    p = cm.ProbePort(csx, n + 1, W / 2, H, H + T, 0.0, d * X_MEAS, y_c=c)
    p.place(mesh, -d)
    probes.append(p)
msum = cm.mesh_summary(mesh)
print('mesh', msum['cells'], msum['smallestCell_mm'], flush=True)

path, run_s = cm.post_or_run(fdtd, csx, NAME + ('-coarse' if COARSE else ''), THREADS)
stats = cm.run_stats(path)
dt_fdtd = stats.get('timestep (s)')
f = cm.F_GRID
for p in probes:
    p.read(path, f)
steps = int(round(probes[0].t_end / dt_fdtd)) if dt_fdtd else None
ZR = 50.0
ab = [p.waves(ZR) for p in probes]
S, resid = cm.fit_s([(np.array([w[0] for w in ab]), np.array([w[1] for w in ab]))], cm.XOR4)
a, b, c, d = S[0, 0], S[1, 0], S[2, 0], S[3, 0]
sdd11, sdd21, scc11, scc21 = a - b, c - d, a + b, c + d
band = (f >= 1e9) & (f <= 10e9)
top = (f >= 0.1e9) & (f <= cm.F_TOP)
k0 = 2 * np.pi * np.where(f > 0, f, np.nan) / cm.C0


def modal(pp, pn, kind):
    if kind == 'diff':
        U = [u1 - u2 for u1, u2 in zip(pp.U, pn.U)]
        I = [(i1 - i2) / 2 for i1, i2 in zip(pp.I, pn.I)]
    else:
        U = [(u1 + u2) / 2 for u1, u2 in zip(pp.U, pn.U)]
        I = [i1 + i2 for i1, i2 in zip(pp.I, pn.I)]
    _, _, z, beta = cm.line_of(U, I, pp.U_delta, pp.I_delta)
    with np.errstate(all='ignore'):
        return np.real(z), (np.real(beta) / k0) ** 2


zd = [modal(probes[i], probes[i + 1], 'diff') for i in (0, 2)]
zc = [modal(probes[i], probes[i + 1], 'cm') for i in (0, 2)]
zdiff = float(np.mean([np.mean(z[0][band]) for z in zd]))
zcm = float(np.mean([np.mean(z[0][band]) for z in zc]))
eodd = float(np.mean([np.mean(z[1][band]) for z in zd]))
eeven = float(np.mean([np.mean(z[1][band]) for z in zc]))
L = (probes[2].x_meas_actual - probes[0].x_meas_actual) * cm.UNIT
with np.errstate(all='ignore'):
    ph = np.unwrap(np.angle(sdd21[1:]))
    eodd_s21 = float(np.mean(((-ph / (k0[1:] * L)) ** 2)[band[1:]]))
    ph = np.unwrap(np.angle(scc21[1:]))
    eeven_s21 = float(np.mean(((-ph / (k0[1:] * L)) ** 2)[band[1:]]))
t, z = cm.tdr(sdd11, TR, 2 * ZR, t_after=250e-12)
td = 2 * L * np.sqrt(eodd_s21) / cm.C0
plateau = (t >= 20e-12) & (t <= td - 20e-12)
z_tdr = float(np.mean(z[plateau]))
sv = cm.passivity(S)
big = max(p.peak for p in probes)
tails = [p.tail_abs / big for p in probes]  # against the largest peak (an undriven port's own peak is small)
keep = np.arange(0, len(f), 2)
fx = {
    'format': 'emsim-openems-fixture', 'formatVersion': 1, 'id': NAME + ('-coarse' if COARSE else ''),
    'description': "openEMS: the owner's LVDS_100R edge-coupled pair (C41) on L1 over L2 of the default stackup, w 0.11 "
                   's 0.2 trapezoid with JLCPCB mask, 10 mm between the reference planes, four 50 ohm lumped ports 3 mm '
                   'beyond them' + (' (coarse mesh)' if COARSE else ''),
    'case': 'C41',
    'structure': {
        'kind': 'trace', 'units': 'mm',
        'frame': 'x along the lines, y across (pair centre y = 0, P at +y), z up; z = 0 is the top face of L2 (the '
                 'PEC floor); the lines run from x = -8 to 8, the domain to |x| = 9.6 with the PML in the outer 8 cells',
        'stackup': [
            {'id': 'MT', 'kind': 'mask', 'er': ER_MASK, 'tand': 0, 'onLaminate': MASK_LAM, 'overCopper': MASK_CU,
             'sides': MASK_CU, 'between': MASK_LAM, 'note': 'one box over the laminate and one box around each trace'},
            {'id': 'L1', 'kind': 'copper', 'thickness': T, 'etch': 'trapezoid, base %g on the laminate, top %g '
             '(offset %g per side)' % (W, WT, ETCH), 'model': 'PEC extruded polygon'},
            {'id': 'D1', 'kind': 'dielectric', 'thickness': H, 'er': ER_SUB, 'tand': 0, 'material': 'prepreg 3313'},
            {'id': 'L2', 'kind': 'copper', 'role': 'reference plane', 'model': 'PEC boundary at z = 0'},
        ],
        'signals': [{'name': 'P', 'layer': 'L1', 'width': W, 'u': YC}, {'name': 'N', 'layer': 'L1', 'width': W, 'u': -YC}],
        'gap': S_GAP, 'above': 'air to z = %.1f' % Z_TOP, 'sides': 'air and laminate to |y| = %.1f' % Y_END,
    },
    'openems': cm.openems_info(),
    'mesh': dict(msum, barrels='none', notes='y: cells <= %.3f over the traces (lines on the base and top edges and '
                 'the mask faces), graded 1.3 to 0.15, mirror-symmetric about y = 0; z: 4 cells in the prepreg, lines '
                 'on every copper and mask face, graded to 0.15; x: 0.1 uniform, symmetric' % fine,
                 timestep_s=dt_fdtd, probeSampling_s=probes[0].dt),
    'excitation': {'kind': 'gauss', 'f0_Hz': 0, 'fc_minus20dB_Hz': cm.F_TOP, 'ports': ['P1'],
                   'source': 'openEMS LumpedPort 1 (R %g ohm, soft E source in its edges) at x = %g' % (R_PORT, -X_PORT)},
    'run': {'endCriterion_dB': -50, 'maxTime_s': T_MAX, 'probeTailRelative': tails, 'steps': steps, 'runs': 1,
            'simulatedTime_s': probes[0].t_end, 'openemsStats': stats},
    'ports': [{'number': n + 1, 'name': pname[n], 'kind': 'lumped port R %g ohm at x = %g, y = %g; waves from a probe '
               'plane (voltage at 3 x lines, current loop around the whole copper section)' % (R_PORT, dd * X_PORT, cc),
               'referencePlane_x': probes[n].x_meas_actual, 'excited': n == 0} for n, (dd, cc) in enumerate(PORTS)],
    'results': {
        'sParameters': {'zRef_ohm': ZR, 'ports': pname, 'pattern': cm.XOR4,
                        'referencePlanes': "the ports' x above (10 mm apart, no de-embedding)",
                        'how': 'one excitation (P1); S_ij = p[i xor j] by the mirror symmetries y -> -y and x -> -x '
                               '(common.fit_s), which removes the end ports\' mismatch; stored: the first column',
                        'f_Hz': cm.rnd(f[keep], 8), 's11': cm.cplx(a[keep]), 's21': cm.cplx(b[keep]),
                        's31': cm.cplx(c[keep]), 's41': cm.cplx(d[keep])},
        'mixedMode': {'how': 'Sdd11 = S11 - S21, Sdd21 = S31 - S41, Scc11 = S11 + S21, Scc21 = S31 + S41 (pairs (P1, '
                             'N1) and (P2, N2), zRef 100 and 25 ohm)',
                      'sdd21At10GHz_dB': round(float(cm.db(sdd21)[np.argmin(np.abs(f - 10e9))]), 4),
                      'sdd11At10GHz_dB': round(float(cm.db(sdd11)[np.argmin(np.abs(f - 10e9))]), 3)},
        'tdr': {'port': 'differential, pair (P1, N1)', 'riseTime_s': TR, 'edge': 'Gaussian, 10-90 %, fullwave.md '
                'section 7.2', 'zRef_ohm': 2 * ZR, 'time': 'round trip, 0 = 50 % of the edge at the reference plane',
                't_s': cm.rnd(t[::2], 6), 'z_ohm': cm.rnd(z[::2], 6), 'plateau_ohm': round(z_tdr, 4)},
        'line': {'zdiff_ohm': round(zdiff, 4), 'zcm_ohm': round(zcm, 4), 'eeffOdd': round(eodd, 5),
                 'eeffEven': round(eeven, 5), 'eeffOddFromSdd21': round(eodd_s21, 5),
                 'eeffEvenFromScc21': round(eeven_s21, 5), 'band_Hz': [1e9, 10e9],
                 'how': 'modal sums of the probe planes (both ends averaged): differential V_P - V_N, (I_P - I_N)/2; '
                        'common (V_P + V_N)/2, I_P + I_N; Z = sqrt(E dE/(H dH)), eeff from beta; and eeff from the '
                        'phase of Sdd21 and Scc21 over the 10 mm',
                 'vsFrequency': {'f_Hz': cm.rnd(f[keep][1::5], 8),
                                 'zdiff_ohm': cm.rnd(zd[0][0][keep][1::5], 6), 'zcm_ohm': cm.rnd(zc[0][0][keep][1::5], 6),
                                 'eeffOdd': cm.rnd(zd[0][1][keep][1::5], 6), 'eeffEven': cm.rnd(zc[0][1][keep][1::5], 6)}},
    },
    'sanity': {
        'zdiff2D_ohm': ZDIFF_2D, 'zcm2D_ohm': ZCM_2D,
        'dzdiff': round(zdiff / ZDIFF_2D - 1, 5), 'dzcm': round(zcm / ZCM_2D - 1, 5),
        'note': 'the 2D solver (lines.ts) on the same trapezoid, mask and stackup (facts-cases.md C41: 103.36 +- '
                '0.15, Zcm 30.91); bars |dz| <= 3 %',
        'passivityMax': round(float(np.max(sv[top])), 6), 'reciprocityMax': 0.0,
        'symmetryResidualMax': round(float(np.max(resid[top])), 6), 'probeTailMax': float(np.max(tails)),
        'bars': {'passivityMax': 1.01, 'probeTailMax': 1e-3, 'dz': 0.03, 'band_Hz': [0.1e9, cm.F_TOP]},
    },
    'provenance': cm.provenance('lvds.py', run_s, THREADS),
}
fx['provenance']['runTime_s'], post = cm.earlier_run_time(fx['id'], run_s)
if post:
    fx['provenance']['postProcessedAgain'] = 'from the same run' + chr(39) + 's probe files (--post): S, lines and sanity re-made by the scripts named'
cm.write_fixture(fx['id'], fx)
print('RESULT %s: Zdiff %.3f (2D %.3f, %+.2f %%) Zcm %.3f (2D %.3f, %+.2f %%) eeff odd %.4f / %.4f even %.4f / %.4f, '
      'TDR plateau %.2f | passivity %.5f tail %.1e | %d cells, %s steps, dt %s, run %.1f s'
      % (fx['id'], zdiff, ZDIFF_2D, 100 * (zdiff / ZDIFF_2D - 1), zcm, ZCM_2D, 100 * (zcm / ZCM_2D - 1), eodd, eodd_s21,
         eeven, eeven_s21, z_tdr, float(np.max(sv[top])), float(np.max(tails)), msum['cells']['total'], steps,
         dt_fdtd, run_s))
