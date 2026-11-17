// The nine equations of the full-wave runs (step M7.2d; text and steps in docs/em-sim/equations-list.md "New for
// full-wave runs", TeX and live fields in theory-waves.md §14). Their numbers come from the Waves section's estimate
// before a run and from the run after it (eqvaluesWaves.wavesBinding on fullwave.preview and the FdtdResult). Names are
// SI (m, s, Hz) as the rest of the registry; the grid's curls, the field values and the transforms are names whose TeX
// says what they stand for (the grammar has no curl, sum or matrix inverse). Assembled and parsed in equations.ts.

import { src, sym } from './equationsDef';
import type { Def, EmObject } from './equationsDef';
import type { SymbolInfo } from '../equations/equation';

const LINEAR = 'linear, isotropic materials; copper a perfect conductor';

export const WAVES_DEFS: Def[] = [
  // §14 fw-yee: Yee's updates, the Courant limit, the run's length.
  {
    id: 'fdtd-update', title: 'Yee’s leapfrog updates', topic: 'fw-yee', on: 'waves', live: false,
    text: 'H_1 = H_0 - c_0*Delta_t*curlE', where: ['E_1 = C_A*E_0 + C_B*c_0*Delta_t*curlH'],
    sources: [src('WikiFDTD', ''), src('Yee1966', '')],
    derivation: 'Maxwell’s two curl equations, each as a central difference half a step from the field it updates.',
    assumptions: [LINEAR, 'the magnetic field stored as η₀·H'],
    engine: 'fdtd/materials.ts CA, CB (copper: both 0); fdtd/cpu.ts and the WebGPU kernels update H, then E',
    steps: [
      ['dE_dt = c_0/varepsilon_r*curlH - sigma_d/(varepsilon_0*varepsilon_r)*E_h', 'Ampère’s law with `Ht = eta_0*H_m`, since `eta_0*varepsilon_0 = 1/c_0`'],
      ['(E_1 - E_0)/Delta_t = c_0/varepsilon_r*curlH - sigma_d/(varepsilon_0*varepsilon_r)*(E_1 + E_0)/2', 'a central difference at the half step where the magnetic field lives, the loss averaged over the step'],
      ['E_1 = C_A*E_0 + C_B*c_0*Delta_t*curlH', 'step 2 solved for the new field, with `C_A = (1 - a_l)/(1 + a_l)`, `C_B = 1/(varepsilon_r*(1 + a_l))` and `a_l = sigma_d*Delta_t/(2*varepsilon_0*varepsilon_r)`'],
      ['dH_dt = -c_0*curlE', 'Faraday’s law for the scaled field, since `eta_0/mu_0 = c_0`'],
      ['H_1 = H_0 - c_0*Delta_t*curlE', 'the same central difference, the electric field half a step between; copper has `C_A = C_B = 0`'],
    ],
  },
  {
    id: 'fdtd-courant', title: 'The Courant limit on the time step', topic: 'fw-yee', on: 'waves',
    text: 'Delta_t = S_c/(c_0*sqrt(1/Delta_x^2 + 1/Delta_y^2 + 1/Delta_z^2))',
    sources: [src('WikiFDTD', ''), src('CFL1928', '')],
    derivation: 'Yee’s dispersion relation for a plane wave on the grid; its shortest wave sets the limit.',
    assumptions: ['the smallest cell on each axis', 'S_c = 0.95, the tool’s margin'],
    engine: 'fdtd/estimate.ts courantDt (COURANT 0.95) on the mesh’s smallest cells',
    steps: [
      ['(sin(omega*Delta_t/2)/(c_0*Delta_t))^2 = (sin(k_x*Delta_x/2)/Delta_x)^2 + (sin(k_y*Delta_y/2)/Delta_y)^2 + (sin(k_z*Delta_z/2)/Delta_z)^2', 'a plane wave `exp(j*omega*t)*exp(-j*k_x*x_g)` and alike put into the lossless updates (Yee’s dispersion relation)'],
      ['sin(omega*Delta_t/2)^2 = (c_0*Delta_t)^2*(1/Delta_x^2 + 1/Delta_y^2 + 1/Delta_z^2)', 'the grid’s shortest wave, `k_x*Delta_x = pi` and alike on every axis, makes the right side largest'],
      ['S_c = c_0*Delta_t*sqrt(1/Delta_x^2 + 1/Delta_y^2 + 1/Delta_z^2)', 'the Courant number: by step 2 it is `sin(omega*Delta_t/2)`, so it must stay at most 1; above 1 ω is complex and that wave grows at every step'],
      ['Delta_t = S_c/(c_0*sqrt(1/Delta_x^2 + 1/Delta_y^2 + 1/Delta_z^2))', 'solved for the step, with `S_c = 0.95`, the tool’s margin'],
    ],
  },
  {
    id: 'fdtd-steps', title: 'How many steps a run takes', topic: 'fw-yee', on: 'waves',
    text: 'N_t = ceil(T_run/Delta_t)', where: ['T_run = 10*sigma_p + 3*tau_rt'],
    derivation: 'The tool’s rule: the pulse, then three round trips of the longest path from port to port.',
    assumptions: ['the run stops sooner once the energy in the grid is 50 dB under its peak'],
    engine: 'fdtd/estimate.ts runTime and estimate: T, tauRt, steps',
    steps: [
      ['tau_rt = 2*ell_e/c_0', 'there and back along the longest path from port to port, each piece at its own speed'],
      ['T_run = 10*sigma_p + 3*tau_rt', 'ten of the pulse’s σ, then three round trips'],
      ['N_t = ceil(T_run/Delta_t)', 'whole steps'],
    ],
  },
  // §14 fw-mesh: the largest cell and the grid's own dispersion.
  {
    id: 'fdtd-cell', title: 'The largest cell', topic: 'fw-mesh', on: 'waves',
    text: 'Delta_max = c_0/(15*f_hi*sqrt(varepsilon_rmax))', where: ['f_hi = 0.877/t_r'],
    derivation: 'The tool’s rule: fifteen cells per wavelength in the highest permittivity, where the edge’s spectrum is 20 dB down.',
    engine: 'fdtd/model.ts largestCell (Model.hmax, erMax)',
    steps: [
      ['f_hi = 0.877/t_r', 'about where the edge’s spectrum is 20 dB down: `f_band = 2.578*f_3` with `f_3 = 0.3396/t_r` gives 0.8755; the tool takes 0.877'],
      ['lambda_hi = c_0/(f_hi*sqrt(varepsilon_rmax))', 'the wavelength there in the highest permittivity'],
      ['Delta_max = lambda_hi/15', 'fifteen cells per wavelength'],
    ],
  },
  {
    id: 'fdtd-dispersion', title: 'How the grid slows short waves', topic: 'fw-mesh', on: 'waves', live: false,
    text: 'v_n/c_0 = sin(k_w*Delta_h/2)/(k_w*Delta_h/2)', extra: '\\approx 1 - \\tfrac{(k\\Delta)^2}{24}',
    sources: [src('WikiFDTD', '')],
    derivation: 'Step 1 of the Courant limit for a wave along one axis, with a very short time step.',
    assumptions: ['a wave along one axis of a uniform grid'],
    engine: 'none (M6.2a found the grid’s cavity modes on the dispersion relation within 2.7·10⁻⁷)',
    steps: [
      ['omega = 2*c_0*sin(k_w*Delta_h/2)/Delta_h', 'step 1 of the Courant limit for a wave along x as the time step goes to 0 (a finite step brings ω closer to `c_0*k_w`)'],
      ['v_n/c_0 = omega/(c_0*k_w) = sin(k_w*Delta_h/2)/(k_w*Delta_h/2)', 'the wave’s speed on the grid'],
      ['v_n/c_0 = 1 - (k_w*Delta_h)^2/24', 'the first terms of the Taylor series, for up to 15 cells per wavelength; at 15 cells the exact form gives 0.99271'],
    ],
  },
  // §14 fw-ports: the pulse, the port waves and S.
  {
    id: 'fdtd-pulse', title: 'The run’s pulse', topic: 'fw-ports', on: 'waves',
    text: 'f_run = 1.52/t_r', where: ['sigma_p = 3.717/(2*pi*f_run)', 't_0 = 5*sigma_p', 'f_S = 0.816*f_run'],
    derivation: 'A Gaussian’s spectrum, as the edge of the TDR: 60 dB down at f_run, 40 dB down at f_S.',
    engine: 'fdtd/ports.ts pulseOf (fRun, sigma, t0); fdtd/run.ts F_S, the last frequency of the run’s S',
    steps: [
      ['g_p = exp(-(t - t_0)^2/(2*sigma_p^2))', 'the source, its peak at `t_0 = 5*sigma_p`'],
      ['G_f/G_0 = exp(-(2*pi*f*sigma_p)^2/2)', 'a Gaussian’s spectrum, relative to its value at 0 Hz'],
      ['2*pi*f_run*sigma_p = sqrt(2*ln(1000))', '60 dB down at `f_run`: `G_f/G_0 = 1/1000`; the tool rounds to 3.717'],
      ['f_run = 4.465*f_3 = 4.465*0.3396/t_r', 'where the Gaussian edge of rise time `t_r` is 60 dB down (the edge’s band); 1.516, which the tool rounds up to 1.52'],
      ['f_S/f_run = sqrt(ln(100)/ln(1000))', 'the pulse 40 dB down: 0.8165, which the tool takes as 0.816'],
    ],
  },
  {
    id: 'fdtd-waves', title: 'The waves at a port', topic: 'fw-ports', on: 'waves', live: false,
    text: 'a_p = (v_p + Z_p*i_p)/2', where: ['b_p = (v_p - Z_p*i_p)/2'],
    sources: [src('OpenEMSDocs', 'Ports')],
    derivation: 'The definition: the wave going in and the wave coming out of a port of reference Z.',
    assumptions: ['Z the feed’s Z0 from the 2D solver'],
    engine: 'fdtd/run.ts: the port planes’ v and i, records.ports[i].z0',
    steps: [
      ['v_p = a_p + b_p', 'the two definitions added'],
      ['Z_p*i_p = a_p - b_p', 'and subtracted'],
    ],
  },
  {
    id: 'fdtd-s', title: 'S-parameters from the runs', topic: 'fw-ports', on: 'waves', live: false,
    text: 'S_m = B_m*A_inv', where: ['A_ij = DFT_a'],
    derivation: 'The transforms of the port waves of every run, one run per port.',
    assumptions: ['the fields have died down before the record ends'],
    engine: 'fdtd/run.ts: the DFT of the records, S = B·A⁻¹ per frequency (res.nport)',
    steps: [
      ['A_ij = DFT_a', 'the transform of port i’s wave in the run driven at j; the record ends once the fields have died down, so the sum is the whole transform'],
      ['B_m = S_m*A_m', 'the network’s relation holds for every run at once, so the loads’ small reflections need no correction'],
      ['S_m = B_m*A_inv', 'times the inverse of the matrix of the waves going in'],
    ],
  },
  // §14 fw-cost: what a run costs.
  {
    id: 'fdtd-cost', title: 'What a run costs', topic: 'fw-cost', on: 'waves',
    text: 't_run = 1.5*N_cells*N_t*N_ports/R_c',
    derivation: 'The estimator: cell updates over the rate, with CPML, ports and records over the bare update.',
    assumptions: ['R the table rate, or the rate this device measured on a similar grid'],
    engine: 'fdtd/estimate.ts estimate (OVERHEAD 1.5, seconds) × the runs',
    steps: [
      ['W_u = N_cells*N_t*N_ports', 'cell updates: every cell at every step, one run per port'],
      ['t_run = 1.5*W_u/R_c', 'CPML, ports and records over the bare update'],
      ['W_s/W_u = 1/s_c^3*1/s_c = 1/s_c^4', 'every cell scaled by `s_c`: the cells by `1/s_c^3`, the steps by `1/s_c` through the Courant limit'],
    ],
  },
];

const m = 'm', s = 's', Hz = 'Hz';
/** Meanings of the full-wave entries' names (their steps' too). */
export const WAVES_SYMBOLS: Readonly<Record<string, SymbolInfo<EmObject>>> = {
  H_0: sym('the scaled magnetic field η₀·H on a face, half a step before', 'V/m', 'solver'),
  H_1: sym('the scaled magnetic field η₀·H on a face, half a step after', 'V/m', 'solver'),
  E_0: sym('the electric field on an edge at step n', 'V/m', 'solver'), E_1: sym('the electric field on an edge at step n + 1', 'V/m', 'solver'),
  E_h: sym('the electric field half way between the two', 'V/m', 'derivation'),
  curlE: sym('the grid’s curl of E around a face (differences over the cells)', 'V/m²', 'solver'),
  curlH: sym('the grid’s curl of η₀·H around an edge', 'V/m²', 'solver'),
  dE_dt: sym('rate of change of E', 'V/(m·s)', 'derivation'), dH_dt: sym('rate of change of η₀·H', 'V/(m·s)', 'derivation'),
  Ht: sym('the scaled magnetic field', 'V/m', 'derivation'), H_m: sym('the magnetic field', 'A/m', 'derivation'),
  sigma_d: sym('conductivity of the laminate (its loss at one frequency)', 'S/m', 'stackup'),
  a_l: sym('the loss over one step', '', 'derivation'),
  C_A: sym('the update’s first coefficient on an edge', '', 'solver'), C_B: sym('the update’s second coefficient on an edge', '', 'solver'),
  Delta_t: sym('the time step', s, 'solver'),
  Delta_x: sym('the smallest cell along x', m, 'solver'), Delta_y: sym('the smallest cell along y', m, 'solver'), Delta_z: sym('the smallest cell along z', m, 'solver'),
  S_c: sym('the Courant number', '', 'solver'),
  k_x: sym('wavenumber along x', '1/m', 'derivation'), k_y: sym('wavenumber along y', '1/m', 'derivation'), k_z: sym('wavenumber along z', '1/m', 'derivation'),
  x_g: sym('position along x', m, 'derivation'), t: sym('time', s, 'derivation'),
  N_t: sym('steps of the run', '', 'solver'), T_run: sym('the run’s length in time', s, 'solver'),
  tau_rt: sym('round trip of the longest path from port to port', s, 'solver'),
  ell_e: sym('the longest path from port to port, each piece times the square root of its permittivity', m, 'solver'),
  sigma_p: sym('standard deviation of the run’s Gaussian pulse', s, 'drive'), t_0: sym('time of the pulse’s peak', s, 'drive'),
  Delta_max: sym('the largest cell', m, 'solver'), f_hi: sym('where the edge’s spectrum is 20 dB down', Hz, 'drive'),
  varepsilon_rmax: sym('the highest relative permittivity of the stackup', '', 'stackup'),
  lambda_hi: sym('wavelength at f_hi in the highest permittivity', m, 'solver'),
  v_n: sym('a wave’s speed on the grid', 'm/s', 'solver'), k_w: sym('wavenumber of the wave', '1/m', 'derivation'),
  Delta_h: sym('the cell along the wave', m, 'solver'),
  f_run: sym('where the pulse’s spectrum is 60 dB down', Hz, 'drive'), f_S: sym('the run’s highest S-parameter frequency (pulse 40 dB down)', Hz, 'drive'),
  g_p: sym('the source’s pulse', '', 'drive'), G_f: sym('the pulse’s spectrum at f', 's', 'derivation'), G_0: sym('the pulse’s spectrum at 0 Hz', 's', 'derivation'),
  a_p: sym('the wave going into a port', 'V', 'port'), b_p: sym('the wave coming out of a port', 'V', 'port'),
  v_p: sym('voltage between the trace and its plane at the port', 'V', 'port'), i_p: sym('current along the trace at the port', 'A', 'port'),
  Z_p: sym('the port’s reference impedance (the feed’s 2D Z0)', 'Ω', 'port'),
  S_m: sym('the S-parameter matrix at a frequency', '', 'port'), A_m: sym('the waves going in, a column per run', 'V·s', 'port'),
  B_m: sym('the waves coming out, a column per run', 'V·s', 'port'), A_inv: sym('the inverse of A', '1/(V·s)', 'port'),
  A_ij: sym('the transform of port i’s incoming wave in the run driven at j', 'V·s', 'port'),
  DFT_a: sym('the sum of that wave’s samples times e^(−j2πfnΔt), times Δt', 'V·s', 'derivation'),
  t_run: sym('the estimated run time', s, 'solver'), N_cells: sym('cells of the grid', '', 'solver'), N_ports: sym('ports, one run each', '', 'solver'),
  R_c: sym('cell updates per second', '1/s', 'solver'), W_u: sym('cell updates of the run', '', 'solver'),
  W_s: sym('cell updates with every cell scaled', '', 'derivation'), s_c: sym('the scale of every cell', '', 'derivation'),
};

export const WAVES_TEX_NAMES: Readonly<Record<string, string>> = {
  H_0: '\\tilde{\\mathbf H}^{n-1/2}', H_1: '\\tilde{\\mathbf H}^{n+1/2}', E_0: '\\mathbf E^{n}', E_1: '\\mathbf E^{n+1}', E_h: '\\mathbf E',
  curlE: '\\nabla\\times\\mathbf E^{n}', curlH: '\\nabla\\times\\tilde{\\mathbf H}^{n+1/2}',
  dE_dt: '\\partial\\mathbf E/\\partial t', dH_dt: '\\partial\\tilde{\\mathbf H}/\\partial t', Ht: '\\tilde{\\mathbf H}', H_m: '\\mathbf H',
  sigma_d: '\\sigma_\\mathrm{d}', a_l: 'a', C_A: 'C_A', C_B: 'C_B',
  Delta_t: '\\Delta t', Delta_x: '\\Delta x', Delta_y: '\\Delta y', Delta_z: '\\Delta z', S_c: 'S_c', x_g: 'x',
  N_t: 'N_t', T_run: 'T', tau_rt: '\\tau_\\mathrm{rt}', ell_e: '\\textstyle\\sum_i \\ell_i\\sqrt{\\varepsilon_{\\mathrm{eff},i}}',
  sigma_p: '\\sigma', t_0: 't_0', Delta_max: '\\Delta_\\mathrm{max}', f_hi: 'f_\\mathrm{hi}', varepsilon_rmax: '\\varepsilon_{r,\\mathrm{max}}',
  lambda_hi: '\\lambda_\\mathrm{hi}', v_n: 'v', k_w: 'k', Delta_h: '\\Delta',
  f_run: 'f_\\mathrm{run}', f_S: 'f_S', g_p: 'g', G_f: '|G(f)|', G_0: '|G(0)|',
  a_p: 'a', b_p: 'b', v_p: 'v', i_p: 'i', Z_p: 'Z',
  S_m: '\\mathbf S', A_m: '\\mathbf A', B_m: '\\mathbf B', A_inv: '\\mathbf A^{-1}', A_ij: 'A_{ij}',
  DFT_a: '\\textstyle\\sum_n a_{i,j}[n]\\,e^{-j2\\pi f n\\Delta t}\\,\\Delta t',
  t_run: 't_\\mathrm{run}', N_cells: 'N_\\mathrm{cells}', N_ports: 'N_\\mathrm{ports}', R_c: 'R', W_u: 'W', W_s: 'W(s)', s_c: 's',
};
