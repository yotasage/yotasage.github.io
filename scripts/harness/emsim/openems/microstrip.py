"""openEMS fixture: the owner's 50R_SE microstrip, case C39 (docs/em-sim/facts-cases.md), with JLCPCB solder mask.

Frame: x along the line (engine.md's v), y across it (u), z up with z = 0 at the top face of In1, the reference
plane, which is the PEC boundary at the bottom of the domain. Lossless. The line ends in a 50 ohm lumped port at each
end (x = -8 and 8; port 1 is the source); the waves are measured by probe planes (common.ProbePort) at x = -5 and 5,
the reference planes, 10 mm apart.
Writes fixtures/msl-c39.json. Usage: python microstrip.py [--coarse]
"""
import sys

import numpy as np

import common as cm
from common import ContinuousStructure, openEMS

NAME = 'msl-c39'
COARSE = '--coarse' in sys.argv

# C39 (facts-cases.md) with the JLCPCB mask of solver.md's BEM case
W, T, H = 0.1377, 0.035, 0.092
ER_SUB = 4.1
ER_MASK, MASK_LAM, MASK_CU = 3.8, 0.0305, 0.0152
X_END, X_PORT, X_MEAS = 9.6, 8.0, 5.0
R_PORT = 50.0
Y_END, Z_TOP = 2.4, 2.4  # 8 PML cells of 0.15 take the outer 1.2 mm: 1.2 mm (13 h) stays clear
TR = 35e-12
THREADS = int(cm.arg('threads', 8))
T_MAX = cm.arg('maxtime_ps', 0.8e-9 * 1e12) * 1e-12  # openEMS's energy measure stalls near -31 dB (see notes-M0.4b.md)

fdtd = openEMS(NrTS=400000, EndCriteria=1e-5)
fdtd.SetGaussExcite(0, cm.F_TOP)
fdtd.SetMaxTime(T_MAX)
fdtd.SetBoundaryCond(['PML_8', 'PML_8', 'PML_8', 'PML_8', 'PEC', 'PML_8'])
csx = ContinuousStructure()
fdtd.SetCSX(csx)
mesh = csx.GetGrid()
mesh.SetDeltaUnit(cm.UNIT)

fine = 0.03 if COARSE else 0.015
yt, ym = W / 2, W / 2 + MASK_CU
mesh.AddLine('y', [0, yt, -yt, ym, -ym])
mesh.SmoothMeshLines('y', fine, 1.3)
cm.smooth(mesh, 'y', [-Y_END, Y_END], 0.15)
mesh.AddLine('z', [0, H, H + MASK_LAM, H + T, H + T + MASK_CU])
mesh.SmoothMeshLines('z', H / 4, 1.3)
cm.smooth(mesh, 'z', [Z_TOP], 0.15)
cm.smooth(mesh, 'x', [-X_END, -X_PORT, -X_MEAS, 0, X_MEAS, X_PORT, X_END], 0.1)

sub = csx.AddMaterial('prepreg', epsilon=ER_SUB)
sub.AddBox([-X_END, -Y_END, 0], [X_END, Y_END, H], priority=1)
mask = csx.AddMaterial('mask', epsilon=ER_MASK)
mask.AddBox([-X_END, -Y_END, H], [X_END, Y_END, H + MASK_LAM], priority=2)
mask.AddBox([-X_END, -ym, H], [X_END, ym, H + T + MASK_CU], priority=3)
cu = csx.AddMetal('copper')
cu.AddBox([-X_PORT, -yt, H], [X_PORT, yt, H + T], priority=10)
cm.lumped_port(fdtd, 1, R_PORT, -X_PORT, yt, 0.0, H, 1)
cm.lumped_port(fdtd, 2, R_PORT, X_PORT, yt, 0.0, H, 0)

p1 = cm.ProbePort(csx, 1, yt, H, H + T, 0.0, -X_MEAS)
p2 = cm.ProbePort(csx, 2, yt, H, H + T, 0.0, X_MEAS)
p1.place(mesh, +1)
p2.place(mesh, -1)
msum = cm.mesh_summary(mesh)
print('mesh', msum['cells'], msum['smallestCell_mm'])

path, run_s = cm.run(fdtd, csx, NAME, THREADS)

f = cm.F_GRID
p1.read(path, f)
p2.read(path, f)
ZR = 50.0
a1, b1 = p1.waves(ZR)
a2, b2 = p2.waves(ZR)
s11, s21 = cm.sym_s(a1, b1, a2, b2)

with np.errstate(all='ignore'):
    k0 = 2 * np.pi * f / cm.C0
    eeff1, eeff2 = (np.real(p1.beta) / k0) ** 2, (np.real(p2.beta) / k0) ** 2
    L = (p2.x_meas_actual - p1.x_meas_actual) * cm.UNIT
    ph = np.unwrap(np.angle(s21[1:]))
    eeff_s21 = np.concatenate([[np.nan], (-ph / (k0[1:] * L)) ** 2])
band = (f >= 1e9) & (f <= 10e9)
with np.errstate(all='ignore'):
    A, B, C, _ = cm.s_to_abcd(s11, s21, ZR)
    z_abcd = float(np.mean(np.real(np.sqrt(B / C))[band]))
    low = (f >= 1e9) & (f <= 5e9)  # acos(A) folds beyond a line angle of pi (about 8 GHz here)
    e_abcd = float(np.mean(((np.real(np.arccos(A)) / (k0 * L)) ** 2)[low]))
z0_1, z0_2 = float(np.mean(np.real(p1.z_line[band]))), float(np.mean(np.real(p2.z_line[band])))
z0 = 0.5 * (z0_1 + z0_2)
eeff_b = float(np.mean(eeff_s21[band]))
t, z = cm.tdr(s11, TR, ZR, t_after=250e-12)
td = 2 * L * np.sqrt(eeff_b) / cm.C0  # round trip between the reference planes
plateau = (t >= 20e-12) & (t <= td - 20e-12)
z_tdr = float(np.mean(z[plateau]))
stats = cm.run_stats(path)
dt_fdtd = stats.get('timestep (s)')
steps = int(round(p1.t_end / dt_fdtd)) if dt_fdtd else None

keep = np.arange(0, len(f), 2)  # 100 MHz steps for the stored lists
bem = 50.526
hj_bare = 54.0558
fx = {
    'format': 'emsim-openems-fixture', 'formatVersion': 1, 'id': NAME,
    'description': "Owner's 50R_SE microstrip (C39) on F.Cu over In1 with JLCPCB solder mask, 10 mm between the "
                   'reference planes, a 50 ohm lumped port at each end 3 mm beyond them' + (' (coarse mesh)' if COARSE else ''),
    'case': 'C39',
    'structure': {
        'kind': 'trace', 'units': 'mm',
        'frame': 'x along the line (engine.md v), y across (u), z up; z = 0 is the top face of In1 (board-frame z '
                 '1.520 in the C38 stackup); the line runs from x = -8 to 8, the domain to |x| = 9.6 with the PML in the outer 8 cells',
        'stackup': [
            {'id': 'mask', 'kind': 'mask', 'er': ER_MASK, 'tand': 0, 'onLaminate': MASK_LAM, 'overCopper': MASK_CU,
             'sides': MASK_CU, 'note': 'conformal: one box over the laminate and one around the trace'},
            {'id': 'F.Cu', 'kind': 'copper', 'thickness': T, 'etch': 'rectangle', 'model': 'PEC volume'},
            {'id': 'prepreg', 'kind': 'dielectric', 'thickness': H, 'er': ER_SUB, 'tand': 0, 'material': '3313'},
            {'id': 'In1', 'kind': 'copper', 'role': 'reference plane', 'model': 'PEC boundary at z = 0'},
        ],
        'signals': [{'layer': 'F.Cu', 'width': W, 'u': 0}],
        'above': 'air to z = %.1f' % Z_TOP, 'sides': 'air/laminate to |y| = %.1f' % Y_END,
    },
    'openems': cm.openems_info(),
    'mesh': dict(msum, barrels='none', notes='y: cells <= %.3f over the trace and mask edges (lines on both trace '
                 'edges and both mask faces), graded 1.3 to 0.15; z: 4 cells in the prepreg, lines on every '
                 'copper and mask face, graded to 0.15; x: 0.1 uniform' % fine, timestep_s=dt_fdtd, probeSampling_s=p1.dt),
    'excitation': {'kind': 'gauss', 'f0_Hz': 0, 'fc_minus20dB_Hz': cm.F_TOP, 'port': 1,
                   'source': 'openEMS LumpedPort 1 (R %g ohm, soft E source in its edges) at x = %g' % (R_PORT, -X_PORT)},
    'run': {'endCriterion_dB': -50, 'maxTime_s': T_MAX, 'probeTailRelative': [p1.tail, p2.tail], 'steps': steps, 'simulatedTime_s': p1.t_end, 'openemsStats': stats},
    'ports': [
        {'number': n, 'kind': 'lumped port R %g ohm at x = %g; waves from a probe plane (voltage at 3 x lines, '
         'current loop around the whole copper section, as openEMS MSLPort)' % (R_PORT, xp),
         'referencePlane_x': p.x_meas_actual, 'excited': n == 1}
        for n, p, xp in ((1, p1, -X_PORT), (2, p2, X_PORT))],
    'results': {
        'sParameters': {'zRef_ohm': ZR, 'referencePlanes': 'the ports\' x above (10 mm apart, no de-embedding)',
                        'how': 'one excitation; S22 = S11 and S12 = S21 by symmetry and reciprocity (common.sym_s), '
                               'which removes the end ports\' mismatch',
                        'f_Hz': cm.rnd(f[keep], 8), 's11': cm.cplx(s11[keep]), 's21': cm.cplx(s21[keep])},
        'tdr': {'port': 1, 'riseTime_s': TR, 'edge': 'Gaussian, 10-90 %, fullwave.md section 7.2', 'zRef_ohm': ZR,
                'time': 'round trip, 0 = 50 % of the edge at the reference plane', 't_s': cm.rnd(t[::2], 6),
                'z_ohm': cm.rnd(z[::2], 6)},
        'line': {
            'z0_ohm': round(z0, 4), 'eeff': round(eeff_b, 5), 'band_Hz': [1e9, 10e9],
            'z0FromPorts_ohm': [round(z0_1, 4), round(z0_2, 4)],
            'z0FromTdrPlateau_ohm': round(z_tdr, 4),
            'z0FromAbcd_ohm': round(z_abcd, 4), 'eeffFromAbcd': round(e_abcd, 5),
            'eeffFromPortBeta': [round(float(np.mean(eeff1[band])), 5), round(float(np.mean(eeff2[band])), 5)],
            'how': 'z0: mean over the band of Re sqrt(E dE / (H dH)) at the two ports; eeff: from the phase of S21 '
                   'over the measured plane distance %.4f mm' % (L / cm.UNIT),
            'vsFrequency': {'f_Hz': cm.rnd(f[keep][1::5], 8), 'z0_ohm': cm.rnd(np.real(p2.z_line[keep][1::5]), 6),
                            'eeff': cm.rnd(eeff_s21[keep][1::5], 6)},
        },
    },
    'sanity': {
        'reference': 'BEM spike of M0.3 (solver.md): C39 with this mask 50.526 ohm, eeff 3.2918; without mask '
                     'BEM 54.158, Hammerstad-Jensen 54.0558',
        'z0_minus_bem_pct': round(100 * (z0 - bem) / bem, 3),
        'eeff_minus_bem_pct': round(100 * (eeff_b - 3.2918) / 3.2918, 3),
    },
    'provenance': cm.provenance('microstrip.py', run_s, THREADS),
}
cm.write_fixture(NAME + ('-coarse' if COARSE else ''), fx)
print('RESULT %s: Z0 %.4f (ports %.4f %.4f, TDR %.4f) eeff %.5f (beta %.5f %.5f) | BEM 50.526 / 3.2918 | '
      'ABCD %.4f / %.5f | %d cells, %s steps, dt %s s, run %.1f s' % (NAME, z0, z0_1, z0_2, z_tdr, eeff_b,
                                                    np.mean(eeff1[band]), np.mean(eeff2[band]), z_abcd, e_abcd,
                                                    msum['cells']['total'], steps, dt_fdtd, run_s))
