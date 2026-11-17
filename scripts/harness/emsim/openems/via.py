"""openEMS fixture: a through via from F.Cu to B.Cu in the owner's six-layer carrier stackup (C38, C44), the test via
of fullwave.md section 11.3 and notes-M0.4a.md: drill 0.3, copper span 1.637, 3 mm feeds.

Frame (engine.md section 1): the via at x = y = 0, z up from the outer face of B.Cu (no mask in this model). The F.Cu
feed runs from the via to -x, the B.Cu feed to +x, both w 0.1377 (class 50R_SE) over their nearest plane (In1, In4).
Pads 0.6 on all six layers (C44 keeps the unused pads), antipads 1.8 on In1-In4, four return vias (drill 0.3, pads 0.6
on F.Cu and B.Cu) on a 1.2 mm radius at 45, 135, 225 and 315 degrees, joining all planes. One dielectric, er 4.3
(KiCad's value, fullwave.md 11.3), lossless. 50 ohm lumped ports at x = -4.5 (source) and 4.5; probe planes at
x = -3 and 3 are the reference planes. Writes fixtures/via-th-0p3.json. Usage: python via.py [--coarse]
"""
import sys

import numpy as np

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))  # python -I leaves it out
import common as cm  # noqa: E402
from common import ContinuousStructure, openEMS

NAME = 'via-th-0p3'
COARSE = '--coarse' in sys.argv

ER = 4.3
W, T_OUT = 0.1377, 0.035
# C38 stackup without masks, bottom to top: (name, kind, z0, z1)
LAYERS = [('B.Cu', 'cu', 0.0, 0.035), ('prepreg', 'd', 0.035, 0.127), ('In4', 'cu', 0.127, 0.157),
          ('core', 'd', 0.157, 0.287), ('In3', 'cu', 0.287, 0.317), ('prepreg', 'd', 0.317, 1.320),
          ('In2', 'cu', 1.320, 1.350), ('core', 'd', 1.350, 1.480), ('In1', 'cu', 1.480, 1.510),
          ('prepreg', 'd', 1.510, 1.602), ('F.Cu', 'cu', 1.602, 1.637)]
ZTOP = 1.637
DRILL, PAD, ANTIPAD = 0.3, 0.6, 1.8
RET_R, RET_N, RET_DRILL = 1.2, 4, 0.3
X_END, Y_END, AIR = 7.2, 4.0, 2.4  # the PML (8 cells of 0.15-0.2) is inside: 1.2 mm of air stays clear
X_PORT, X_MEAS = 4.5, 3.0
R_PORT = 50.0
TR = 35e-12
THREADS = int(cm.arg('threads', 8))
T_MAX = cm.arg('maxtime_ps', 0.8e-9 * 1e12) * 1e-12  # openEMS's energy measure stalls near -31 dB (see notes-M0.4b.md)

fdtd = openEMS(NrTS=150000, EndCriteria=1e-5)
fdtd.SetGaussExcite(0, cm.F_TOP)
fdtd.SetMaxTime(T_MAX)
fdtd.SetBoundaryCond(['PML_8'] * 6)
csx = ContinuousStructure()
fdtd.SetCSX(csx)
mesh = csx.GetGrid()
mesh.SetDeltaUnit(cm.UNIT)

fine = 0.1 if COARSE else 0.05  # 3 or 6 cells per drill
core_box = 1.4
yt = W / 2
mesh.AddLine('x', [-core_box, -DRILL / 2, 0, DRILL / 2, core_box])
mesh.SmoothMeshLines('x', fine, 1.3)
cm.smooth(mesh, 'x', [-X_END, -X_PORT, -X_MEAS, X_MEAS, X_PORT, X_END], 0.15)
third = 0.03  # openEMS's thirds rule at the feed edges: lines d/3 inside and 2d/3 outside each edge
mesh.AddLine('y', [-core_box, -DRILL / 2, -yt - 2 * third / 3, -yt + third / 3, 0,
                   yt - third / 3, yt + 2 * third / 3, DRILL / 2, core_box])
mesh.SmoothMeshLines('y', fine, 1.3)
cm.smooth(mesh, 'y', [-Y_END, Y_END], 0.15)
zl = sorted({z for _, _, a, b in LAYERS for z in (a, b)})
zl += list(np.linspace(0.035, 0.127, 5)[1:-1]) + list(np.linspace(1.510, 1.602, 5)[1:-1])
mesh.AddLine('z', zl)
mesh.SmoothMeshLines('z', 0.05, 1.3)
cm.smooth(mesh, 'z', [-AIR, ZTOP + AIR], 0.2)

diel = csx.AddMaterial('laminate', epsilon=ER)
diel.AddBox([-X_END, -Y_END, 0.035], [X_END, Y_END, 1.602], priority=1)  # outer copper layers sit in air
cu = csx.AddMetal('copper')
for name, kind, z0, z1 in LAYERS:
    if kind != 'cu':
        continue
    if name.startswith('In'):
        cu.AddBox([-X_END, -Y_END, z0], [X_END, Y_END, z1], priority=10)
        diel.AddCylinder([0, 0, z0], [0, 0, z1], ANTIPAD / 2, priority=20)
    cu.AddCylinder([0, 0, z0], [0, 0, z1], PAD / 2, priority=30)
cu.AddCylinder([0, 0, 0], [0, 0, ZTOP], DRILL / 2, priority=30)
ret_xy = []
for k in range(RET_N):
    ang = np.pi / 4 + k * 2 * np.pi / RET_N
    x, y = RET_R * np.cos(ang), RET_R * np.sin(ang)
    ret_xy.append([round(x, 6), round(y, 6)])
    cu.AddCylinder([x, y, 0], [x, y, ZTOP], RET_DRILL / 2, priority=30)
    for z0, z1 in ((0.0, 0.035), (1.602, 1.637)):
        cu.AddCylinder([x, y, z0], [x, y, z1], PAD / 2, priority=30)
cu.AddBox([-X_PORT, -yt, 1.602], [0, yt, 1.637], priority=30)   # F.Cu feed
cu.AddBox([0, -yt, 0.0], [X_PORT, yt, 0.035], priority=30)      # B.Cu feed
cm.lumped_port(fdtd, 1, R_PORT, -X_PORT, yt, 1.510, 1.602, 1)
cm.lumped_port(fdtd, 2, R_PORT, X_PORT, yt, 0.127, 0.035, 0)
p1 = cm.ProbePort(csx, 1, yt, 1.602, 1.637, 1.510, -X_MEAS)
p2 = cm.ProbePort(csx, 2, yt, 0.035, 0.0, 0.127, X_MEAS)
p1.place(mesh, +1)
p2.place(mesh, -1)
msum = cm.mesh_summary(mesh)
print('mesh', msum['cells'], msum['smallestCell_mm'])

path, run_s = cm.run(fdtd, csx, NAME, THREADS)
stats = cm.run_stats(path)
dt_fdtd = stats.get('timestep (s)')

f = cm.F_GRID
p1.read(path, f)
p2.read(path, f)
steps = int(round(p1.t_end / dt_fdtd)) if dt_fdtd else None
ZR = 50.0
a1, b1 = p1.waves(ZR)
a2, b2 = p2.waves(ZR)
with np.errstate(all='ignore'):
    s11, s21 = cm.sym_s(a1, b1, a2, b2)
    k0 = 2 * np.pi * f / cm.C0
    eeff1, eeff2 = (np.real(p1.beta) / k0) ** 2, (np.real(p2.beta) / k0) ** 2
    # de-embed the two feeds (their own Z and beta from the probe planes) to the via axis x = 0
    m = cm.s_to_abcd(s11, s21, ZR)
    f1 = cm.line_abcd(p1.z_line, p1.beta, abs(p1.x_meas_actual) * cm.UNIT)
    f2 = cm.line_abcd(p2.z_line, p2.beta, abs(p2.x_meas_actual) * cm.UNIT)
    v = cm.abcd_mul(cm.abcd_mul(cm.abcd_inv(f1), m), cm.abcd_inv(f2))
    zv = np.sqrt(v[1] / v[2])
    zv = np.where(np.real(zv) < 0, -zv, zv)
    tau = np.real(np.arccos((v[0] + v[3]) / 2)) / (2 * np.pi * f)
band = (f >= 1e9) & (f <= 10e9)
zfeed = [float(np.mean(np.real(p.z_line[band]))) for p in (p1, p2)]
zvia = float(np.mean(np.real(zv[band])))
tvia = float(np.mean(tau[band]))
t, z = cm.tdr(s11, TR, ZR, t_after=200e-12)
t_feed = 2 * abs(p1.x_meas_actual) * cm.UNIT * np.sqrt(np.mean(eeff1[band])) / cm.C0
win = (t > t_feed - 30e-12) & (t < t_feed + 40e-12)
z_min, z_max = float(np.min(z[win])), float(np.max(z[win]))
t_min, t_max = float(t[win][np.argmin(z[win])]), float(t[win][np.argmax(z[win])])

eta0 = 376.730313
z_coax = eta0 / (2 * np.pi * np.sqrt(ER)) * np.log(ANTIPAD / DRILL)
z_qcoax = eta0 / (2 * np.pi * np.sqrt(ER)) * (np.log(RET_R / (DRILL / 2)) + np.log(RET_R / (RET_N * RET_DRILL / 2)) / RET_N)
t_barrel = ZTOP * 1e-3 * np.sqrt(ER) / cm.C0

keep = np.arange(0, len(f), 2)
fx = {
    'format': 'emsim-openems-fixture', 'formatVersion': 1, 'id': NAME,
    'description': 'Through via F.Cu to B.Cu, drill 0.3, pads 0.6 on all layers, antipads 1.8, four return vias on '
                   'a 1.2 mm circle, 50R_SE feeds of 3 mm to the reference planes, carrier stackup at er 4.3'
                   + (' (coarse mesh)' if COARSE else ''),
    'case': 'C44 (pad, antipad, stackup); geometry of fullwave.md 11.3',
    'structure': {
        'kind': 'via', 'units': 'mm',
        'frame': 'via at x = y = 0; z up from the outer face of B.Cu (no mask); F.Cu feed toward -x, B.Cu feed toward +x',
        'stackup': [{'id': n, 'kind': 'copper' if k == 'cu' else 'dielectric', 'z0': z0, 'z1': z1,
                     **({'er': ER, 'tand': 0} if k == 'd' else {}),
                     **({'role': 'reference plane'} if n.startswith('In') else {})} for n, k, z0, z1 in LAYERS[::-1]],
        'via': {'x': 0, 'y': 0, 'drill': DRILL, 'finishedHole': None, 'barrel': 'solid PEC cylinder of the drill '
                'diameter (the field sees only the outer surface)', 'from': 'F.Cu', 'to': 'B.Cu', 'stub': 0,
                'pads': {l: PAD for l in ('F.Cu', 'In1', 'In2', 'In3', 'In4', 'B.Cu')},
                'antipads': {l: ANTIPAD for l in ('In1', 'In2', 'In3', 'In4')}},
        'returnVias': [{'x': x, 'y': y, 'drill': RET_DRILL, 'joins': ['In1', 'In2', 'In3', 'In4'],
                        'pads': {'F.Cu': PAD, 'B.Cu': PAD}} for x, y in ret_xy],
        'feeds': [
            {'layer': 'F.Cu', 'width': W, 'thickness': T_OUT, 'over': 'In1', 'from': [0, 0], 'to': [-X_PORT, 0],
             'referencePlaneDistance': X_MEAS},
            {'layer': 'B.Cu', 'width': W, 'thickness': T_OUT, 'over': 'In4', 'from': [0, 0], 'to': [X_PORT, 0],
             'referencePlaneDistance': X_MEAS}],
        'domain': {'x': [-X_END, X_END], 'y': [-Y_END, Y_END], 'z': [-AIR, ZTOP + AIR],
                   'note': 'planes and laminate run into the PML on the four sides'},
    },
    'openems': cm.openems_info(),
    'mesh': dict(msum, barrels='staircase (openEMS default, no conformal option used): %d cells per drill '
                 'in x and y, lines on the drill edges +-0.15; antipad and pad circles staircased on the same '
                 'grid; return vias off-grid' % round(DRILL / fine),
                 notes='x, y: %.3f uniform over |x|, |y| <= %.1f (pads, antipads, returns), graded 1.3 to 0.15; '
                       'y: thirds rule at the feed edges (lines 0.01 inside and 0.02 outside each edge); z: lines on every layer face, 4 cells in the 0.092 prepregs, '
                       'at most 0.05 in the board, graded to 0.2 in the air' % (fine, core_box),
                 timestep_s=dt_fdtd, probeSampling_s=p1.dt),
    'excitation': {'kind': 'gauss', 'f0_Hz': 0, 'fc_minus20dB_Hz': cm.F_TOP, 'port': 1,
                   'source': 'openEMS LumpedPort 1 (R %g ohm, soft E source in its edges) at x = %g' % (R_PORT, -X_PORT)},
    'run': {'endCriterion_dB': -50, 'maxTime_s': T_MAX, 'probeTailRelative': [p1.tail, p2.tail], 'steps': steps, 'simulatedTime_s': p1.t_end, 'openemsStats': stats},
    'ports': [
        {'number': n, 'layer': lay, 'kind': 'lumped port R %g ohm at x = %g; waves from a probe plane (voltage at 3 '
         'x lines, current loop around the whole copper section)' % (R_PORT, xp),
         'referencePlane_x': p.x_meas_actual, 'excited': n == 1}
        for n, p, xp, lay in ((1, p1, -X_PORT, 'F.Cu'), (2, p2, X_PORT, 'B.Cu'))],
    'results': {
        'sParameters': {'zRef_ohm': ZR, 'referencePlanes': 'the ports\' x above (3 mm feeds included, not '
                        'de-embedded)', 'how': 'one excitation; S22 = S11 and S12 = S21 by symmetry and '
                        'reciprocity (common.sym_s), which removes the end ports\' mismatch',
                        'f_Hz': cm.rnd(f[keep], 8), 's11': cm.cplx(s11[keep]), 's21': cm.cplx(s21[keep])},
        'feeds': {'f_Hz': cm.rnd(f[keep][1::5], 8),
                  'z_ohm': [cm.rnd(np.real(p.z_line[keep][1::5]), 6) for p in (p1, p2)],
                  'eeff': [cm.rnd(e[keep][1::5], 6) for e in (eeff1, eeff2)],
                  'z_ohm_1to10GHz': [round(x, 4) for x in zfeed],
                  'eeff_1to10GHz': [round(float(np.mean(e[band])), 5) for e in (eeff1, eeff2)],
                  'how': 'the probe planes\' Z = sqrt(E dE / (H dH)) and beta, for de-embedding the feeds'},
        'tdr': {'port': 1, 'riseTime_s': TR, 'edge': 'Gaussian, 10-90 %, fullwave.md section 7.2', 'zRef_ohm': ZR,
                'time': 'round trip, 0 = 50 % of the edge at the reference plane', 't_s': cm.rnd(t[::2], 6),
                'z_ohm': cm.rnd(z[::2], 6),
                'viaWindow': {'tViaAxis_s': t_feed, 'zMin_ohm': round(z_min, 3), 'tMin_s': t_min,
                              'zMax_ohm': round(z_max, 3), 'tMax_s': t_max}},
        'viaDeembedded': {'z_ohm': round(zvia, 3), 'delay_s': tvia, 'band_Hz': [1e9, 10e9],
                          'L_nH': round(zvia * tvia * 1e9, 4), 'C_pF': round(tvia / zvia * 1e12, 4),
                          'how': 'feeds removed with their own Z and beta to x = 0; Z = sqrt(B/C), delay = '
                                 'acos((A + D)/2)/omega of the remaining ABCD (pads, barrel, trace-to-pad joints)'},
    },
    'sanity': {
        'coaxAntipad_ohm': round(float(z_coax), 3),
        'quasiCoax4Returns_ohm': round(float(z_qcoax), 3),
        'barrelDelay_s': t_barrel,
        'quasiCoaxOverBarrel': {'L_nH': round(float(z_qcoax * t_barrel * 1e9), 4),
                                'C_pF': round(float(t_barrel / z_qcoax * 1e12), 4)},
        'hammerstadJensenFeed_ohm': 52.9811,
        'hammerstadJensenFeedEeff': 2.9805,
        'formulas': 'facts-formulas.md section 7: coax (eta0/(2 pi sqrt(er))) ln(D/d) with D the antipad; '
                    'quasi-coax thin-wire form with N = 4, R = 1.2, a = b = 0.15; delay 1.637 sqrt(er)/c0',
    },
    'provenance': cm.provenance('via.py', run_s, THREADS),
}
cm.write_fixture(NAME + ('-coarse' if COARSE else ''), fx)
print('RESULT %s: via Z %.3f delay %.2f ps (coax %.2f, quasi-coax %.2f, barrel %.2f ps); feeds Z %.3f %.3f; TDR '
      'min %.2f max %.2f | %d cells, %s steps, dt %s, run %.1f s'
      % (NAME, zvia, tvia * 1e12, z_coax, z_qcoax, t_barrel * 1e12, zfeed[0], zfeed[1], z_min, z_max,
         msum['cells']['total'], steps, dt_fdtd, run_s))
