// The 28 equations of vias, the TDR, S-parameters and the trace's target (step M4.2; TeX and live fields in
// docs/em-sim/theory-vias.md §7–§13, text and steps in equations-list.md). Their numbers come from the via model
// (eqvaluesVia.viaBinding on viamodel.viaModel), the target's from inverse.inverse (eqvalues.emBinding). Names are SI
// (m, F, H, s, Hz, Ω) as the rest of the registry; a name the trace uses with another meaning gets a name of its own
// here (L_sec, not L). Assembled and parsed in equations.ts.

import { src, sym } from './equationsDef';
import type { Def, EmObject } from './equationsDef';
import type { SymbolInfo } from '../equations/equation';

const LINE_ON_PIECE = 'each piece of the barrel a coaxial-like line in one material (quasi-TEM)';
const LUMPED = 'the section short against the wavelength (λ/8, Cartier2007)';

export const VIA_DEFS: Def[] = [
  // §7 The via as a line (theory-vias.md `via-line`).
  {
    id: 'via-barrel-z', title: 'The barrel’s impedance in each material', topic: 'via-line', on: 'via', text: 'Z_i = Z_vac/sqrt(varepsilon_ri)',
    derivation: 'The cut’s vacuum capacitance and the line relations: one material fills the cross-section.', assumptions: [LINE_ON_PIECE],
    engine: 'viamodel.viaModel: barrel.zVac, pieces[i].er, pieces[i].z0 (a pair: zdiffVac → zdiff, zcmVac → zcm alike)',
    steps: [
      ['Cp = varepsilon_ri*C_0p', 'one material fills the cut'],
      ['Lp = mu_0*varepsilon_0/C_0p', '`L = mu_0*varepsilon_0/C_0`'],
      ['Z_i = sqrt(Lp/Cp) = 1/(c_0*C_0p*sqrt(varepsilon_ri))', '`Z_0 = sqrt(L/C)`'],
      ['Z_i = Z_vac/sqrt(varepsilon_ri)', 'with `Z_vac = 1/(c_0*C_0p)`, the same cut in vacuum'],
    ],
  },
  {
    id: 'via-barrel-delay', title: 'Delay of a piece of the barrel', topic: 'via-line', on: 'via', text: 'tau_i = ell_i*sqrt(varepsilon_ri)/c_0',
    derivation: 'The delay per unit length √(L′C′) of one material over the piece’s length.', assumptions: [LINE_ON_PIECE],
    engine: 'viamodel.viaModel: pieces[i].delay, zTop − zBot, er',
    steps: [
      ['sqrt(Lp*Cp) = sqrt(varepsilon_ri)/c_0', '`Cp = varepsilon_ri*C_0p` and `Lp = mu_0*varepsilon_0/C_0p`'],
      ['tau_i = ell_i*sqrt(Lp*Cp) = ell_i*sqrt(varepsilon_ri)/c_0', 'the delay per unit length over the length'],
    ],
  },
  {
    id: 'via-coax', title: 'The barrel as a coaxial line', topic: 'via-line', on: 'via', applies: 'line',
    text: 'Z_i = eta_0*ln(D/d)/(2*pi*sqrt(varepsilon_ri))', where: ['eta_0 = 1/(varepsilon_0*c_0)'],
    sources: [src('WikiCapacitance', 'concentric cylinders')], assumptions: [LINE_ON_PIECE, 'the return vias as a tube of diameter D = 2·R_eq'],
    engine: 'viamodel.viaModel: via.drill, wall.Req, pieces[i].z0 (equal by the definition of R_eq)',
    steps: [
      ['Cp = 2*pi*varepsilon_0*varepsilon_ri/ln(D/d)', 'the capacitance of concentric cylinders per unit length'],
      ['Z_i = sqrt(varepsilon_ri)/(c_0*Cp) = eta_0*ln(D/d)/(2*pi*sqrt(varepsilon_ri))', '`Z_i = Z_vac/sqrt(varepsilon_ri)` with `Z_vac = 1/(c_0*C_0p)`'],
    ],
  },
  {
    id: 'via-quasi-coax', title: 'The return vias as thin wires', topic: 'via-line', on: 'via', applies: 'line',
    text: 'Z_qc = eta_0*(ln(R/a) + ln(R/(N*b))/N)/(2*pi*sqrt(varepsilon_ri))', where: ['eta_0 = 1/(varepsilon_0*c_0)'],
    derivation: 'Line charges: the barrel’s q and N return vias of −q/N at the distance R.',
    assumptions: ['thin wires: a and b much smaller than R', 'one via, every return via at R', 'an estimate: the field solver’s cut is the engine’s value'],
    engine: 'eqvaluesVia.quasiCoax (its own closed form; the solver’s pieces[i].z0 differs by about 2 %)',
    steps: [
      ['phi_a = q*ln(R/a)/(2*pi*varepsilon)', 'the barrel’s own charge q and N charges `-q/N` at R, at the barrel'],
      ['phi_b = -q*ln(R/(N*b))/(2*pi*varepsilon*N)', 'at a return via: its own charge, the barrel at R and the others (the product of their distances is `N*R^(N - 1)`)'],
      ['Cp = q/(phi_a - phi_b) = 2*pi*varepsilon/(ln(R/a) + ln(R/(N*b))/N)', 'charge over voltage'],
      ['Z_qc = sqrt(varepsilon_ri)/(c_0*Cp) = eta_0*(ln(R/a) + ln(R/(N*b))/N)/(2*pi*sqrt(varepsilon_ri))', 'with `varepsilon = varepsilon_0*varepsilon_ri`'],
    ],
  },
  {
    id: 'via-req', title: 'The return vias’ equivalent radius', topic: 'via-line', on: 'via', text: 'R_eq = a*exp(2*pi*varepsilon_0/C_0p)',
    derivation: 'The coaxial line with the cut’s vacuum capacitance, solved for its outer radius.',
    assumptions: ['the cut’s vacuum capacitance of one barrel (C₀,₁₁ for a pair)'], engine: 'viacut.equivalentRadius: wall.Req',
    steps: [
      ['C_0p = 2*pi*varepsilon_0/ln(R_eq/a)', 'the coaxial capacitance in vacuum'],
      ['R_eq = a*exp(2*pi*varepsilon_0/C_0p)', 'solved for the outer radius'],
    ],
  },
  {
    id: 'via-section-l', title: 'Inductance of the via section', topic: 'via-line', on: 'via', text: 'L_sec = Z_vac*ell_th/c_0 + L_over',
    derivation: 'L′ is the same in every non-magnetic material; lines in series add; each feed’s run over its plane’s antipad adds the inductance of the trace over the next plane less its own line’s.', assumptions: [LUMPED],
    engine: 'viamodel.viaModel: lumped.L[0][0], the through pieces’ lengths, overs[i].dL',
    steps: [
      ['L_ip = mu_0*varepsilon_0/C_0p = Z_vac/c_0', 'the same in every material'],
      ['L_sec = L_ip*ell_th + L_over = Z_vac*ell_th/c_0 + L_over', 'lines in series add over the through length, and the feeds’ runs over the antipads in series with them'],
    ],
  },
  {
    id: 'via-section-c', title: 'Capacitance of the via section', topic: 'via-line', on: 'via', text: 'C_sec = C_line + Delta_Csum',
    derivation: 'Each piece’s εr·C₀′·ℓ and every node’s ΔC are shunt capacitances, which add.', assumptions: [LUMPED],
    engine: 'viamodel.viaModel: lumped.C[0][0], lumped.lineC, lumped.dCsum',
    steps: [
      ['C_ip = varepsilon_ri*C_0p', 'each piece in its material'],
      ['C_line = C_1p*ell_1 + C_2p*ell_2', 'the pieces’ capacitance (two here, and so on)'],
      ['C_sec = C_line + Delta_Csum', 'shunt capacitances add (a pair adds `Delta_C` on the diagonal and `-k_12*Delta_C` between)'],
    ],
  },
  {
    id: 'via-section-z', title: 'The via section as one element', topic: 'via-line', on: 'via', text: 'Z_sec = sqrt(L_sec/C_sec)',
    derivation: '`z0-lc` on the whole section as one LC element.', assumptions: [LUMPED], engine: 'viamodel.viaModel: lumped.z',
    steps: [['Z_sec = sqrt(L_sec/C_sec)', '`Z_0 = sqrt(L/C)` with the section’s totals in place of the per-length values']],
  },
  {
    id: 'via-section-delay', title: 'Delay of the via section', topic: 'via-line', on: 'via', applies: 'line', text: 'tau_sec = sqrt(L_sec*C_sec)',
    derivation: '`delay-lc` on the section’s totals.', assumptions: [LUMPED], engine: 'viamodel.viaModel: lumped.delay',
    steps: [['tau_sec = sqrt(L_sec*C_sec)', '`tau = sqrt(L*C)` with the section’s totals']],
  },
  {
    id: 'via-section-pair', title: 'The pair’s via section', topic: 'via-line', on: 'via', applies: 'pair',
    text: 'Z_diffsec = 2*sqrt((L_s11 - L_s12)/(C_s11 - C_s12))',
    where: ['Z_cmsec = sqrt((L_s11 + L_s12)/(C_s11 + C_s12))/2', 'tau_sec = sqrt((L_s11 - L_s12)*(C_s11 - C_s12))'],
    derivation: 'The odd and even modes of the section’s L and C matrices.', assumptions: [LUMPED, 'symmetric pair'],
    engine: 'viamodel.viaModel: lumped.L, lumped.C, lumped.zdiff, lumped.zcm, lumped.delay',
    steps: [
      ['Z_oddsec = sqrt((L_s11 - L_s12)/(C_s11 - C_s12))', '`Z_odd = sqrt((L_11 - L_12)/(C_11 - C_12))` on the section'],
      ['Z_diffsec = 2*Z_oddsec', '`Z_diff = 2*Z_odd`'],
      ['Z_evensec = sqrt((L_s11 + L_s12)/(C_s11 + C_s12))', 'the even mode likewise'],
      ['Z_cmsec = Z_evensec/2', '`Z_cm = Z_even/2`'],
    ],
  },
  // §8 Pads and antipads (`via-pads`).
  {
    id: 'via-dc', title: 'What the pads and openings add', topic: 'via-pads', on: 'via', text: 'Delta_Csum = C_axi - C_line',
    extra: '\\text{(each } \\Delta C_k\\text{: the window’s charge at 1 V less the barrel line’s)}',
    derivation: 'The tool’s rule: the axisymmetric whole-via capacitance less the barrel’s line.',
    assumptions: ['the wall at the equivalent radius (not the rule wall)'], engine: 'viamodel.viaModel: nodes[k].dC summed, axiTotal, lumped.lineC',
  },
  {
    id: 'via-pad-coupling', title: 'Coupling of the pads of a pair', topic: 'via-pads', on: 'via', applies: 'pair', text: 'Delta_C12 = -k_12*Delta_C',
    where: ['k_12 = -C_0p12/C_0p'], derivation: 'An estimate: the pads’ excess couples in the cut’s ratio.',
    assumptions: ['an estimate, not measured on its own; a full-wave run of the pair takes the coupling in fully'], engine: 'viamodel.viaModel: barrel.k12, the shunt elements of the nodes',
  },
  {
    id: 'via-target', title: 'Target impedance of the via', topic: 'via-pads', on: 'via', text: 'Z_secx = Z_target',
    extra: '\\text{(x: every antipad’s diameter, or the return vias’ distance; out of reach when both ends lie on one side)}',
    derivation: 'The tool’s rule: the root of the section’s impedance less the target over the searched range.',
    engine: 'viamodel.viaTarget: .x, .value, .range, .values',
  },
  {
    id: 'target', title: 'Target impedance of the trace', topic: 'calculators', text: 'Z_x = Z_target',
    extra: '\\text{(x: the width, the gap, or both scaled)}', derivation: 'The tool’s rule: the root of Z less the target over the searched range.',
    engine: 'inverse.inverse: .w, .s, .value, .range',
  },
  // §9 The return path (`via-return`).
  {
    id: 'cavity-f', title: 'Resonances of a plane pair', topic: 'via-return', on: 'via', live: false,
    text: 'f_mn = c_0*sqrt((m_c/a_x)^2 + (n_c/b_y)^2)/(2*sqrt(varepsilon_r))',
    derivation: 'The plane pair as a cavity with open edges.', assumptions: ['open edges as magnetic walls', 'a rectangular board'],
    engine: 'none (the board’s size is not in the setup, BL134)',
    steps: [
      ['E_z = cos(m_c*pi*x_c/a_x)*cos(n_c*pi*y_c/b_y)', 'open edges as magnetic walls'],
      ['k_c^2 = (m_c*pi/a_x)^2 + (n_c*pi/b_y)^2', 'the wave equation in the plane pair'],
      ['f_mn = c_0*k_c/(2*pi*sqrt(varepsilon_r)) = c_0*sqrt((m_c/a_x)^2 + (n_c/b_y)^2)/(2*sqrt(varepsilon_r))', 'the wavenumber in the material'],
    ],
  },
  // §10 Stubs (`via-stubs`).
  {
    id: 'stub-zin', title: 'Input impedance of an open stub', topic: 'via-stubs', on: 'via', applies: 'line',
    text: 'Z_in = -j*Z_s*cot(theta_s)', where: ['theta_s = 2*pi*f*tau_s'],
    sources: [src('SteerVol2', '§2.4'), src('Ellingson2018', '§3.16')], assumptions: ['a lossless piece, open at its far end'],
    engine: 'viamodel.chainAbcd on the first piece of the stub: A/C',
    steps: [
      ['I_2 = 0', 'the open end'],
      ['Z_in = V_1/I_1 = A_s/C_s', 'the chain matrix with no current out'],
      ['Z_in = cos(theta_s)/(j*sin(theta_s)/Z_s) = -j*Z_s*cot(theta_s)', 'the chain matrix of a line'],
    ],
  },
  {
    id: 'stub-quarter', title: 'The stub’s quarter-wave resonance', topic: 'via-stubs', on: 'via', text: 'f_stub = 1/(4*tau_stub)',
    derivation: 'The open stub shorts the line where cot(βℓ) = 0.', assumptions: ['without its pads (the model’s fRes has them)'],
    engine: 'viamodel.viaModel: stubs[i].delay, stubs[i].fFormula',
    steps: [
      ['theta_q = 2*pi*f_stub*tau_stub = pi/2', 'the first zero of the cotangent, a quarter turn'],
      ['f_stub = 1/(4*tau_stub) = c_0/(4*ell_s*sqrt(varepsilon_effs))', 'with `tau_stub = ell_s*sqrt(varepsilon_effs)/c_0`'],
    ],
  },
  // §13 Where the model stops (`via-limits`).
  {
    id: 'lambda8', title: 'Where a lumped part holds', topic: 'via-limits', on: 'via', text: 'f_valid = c_0/(8*ell_w*sqrt(varepsilon_rw))',
    sources: [src('Cartier2007', 'abstract')], derivation: 'The tool’s rule after Cartier2007: a part is lumped while shorter than λ/8.',
    engine: 'viamodel.viaModel: valid.lumped, valid.window, valid.er (valid.fMax: the lower of this and the plane cavity’s band)',
    steps: [
      ['ell_w = lambda_w/8', 'the rule, with `lambda_w = c_0/(f_valid*sqrt(varepsilon_rw))`'],
      ['f_valid = c_0/(8*ell_w*sqrt(varepsilon_rw))', 'solved for the frequency'],
    ],
  },
  // §11 The TDR (`via-tdr`).
  {
    id: 'edge-f3', title: 'Bandwidth of the edge', topic: 'via-tdr', on: 'via', text: 'f_3 = sqrt(ln(2))/(2*pi*sigma_e)',
    where: ['sigma_e = t_r/(2*z_90)'], derivation: 'A step smoothed by a Gaussian.',
    engine: 'tdr.edgeF3: f3, tr',
    steps: [
      ['t_r = 2*z_90*sigma_e', '10 % and 90 % of a Gaussian edge lie `z_90` standard deviations either side of its middle'],
      ['abs(H) = exp(-(2*pi*f*sigma_e)^2/2)', 'the spectrum of the smoothed step relative to a sharp one'],
      ['exp(-(2*pi*f_3*sigma_e)^2/2) = 1/sqrt(2)', 'half the power'],
      ['2*pi*f_3*sigma_e = sqrt(ln(2))', 'solved'],
      ['f_3*t_r = 2*z_90*sqrt(ln(2))/(2*pi) = 0.3396', 'the product of bandwidth and rise time (rounded)'],
    ],
  },
  {
    id: 'edge-band', title: 'The edge’s band', topic: 'via-tdr', on: 'via', text: 'f_end = sqrt(2*ln(1/L_e))/(2*pi*sigma_e)',
    where: ['f_band = sqrt(2*ln(1/L_b))/(2*pi*sigma_e)', 'sigma_e = t_r/(2*z_90)'],
    derivation: 'Where the edge’s spectrum falls to a level: −20 dB for the flags’ band, −60 dB for the end of the sweep.',
    engine: 'tdr.edgeFrequency: band, nport.f (last)',
    steps: [
      ['exp(-(2*pi*f_L*sigma_e)^2/2) = L_x', 'the spectrum at the level `L_x`'],
      ['f_L = sqrt(2*ln(1/L_x))/(2*pi*sigma_e)', 'solved'],
      ['f_L/f_3 = sqrt(2*ln(1/L_x)/ln(2))', 'against the bandwidth: 2.578 at 0.1 and 4.465 at 0.001'],
    ],
  },
  {
    id: 'tdr-rho', title: 'What the TDR measures', topic: 'via-tdr', on: 'via', text: 'rho = (Z_t - Z_ref)/(Z_t + Z_ref)',
    sources: [src('Ellingson2018', '§3.12')], assumptions: ['late in the reflection of a step from a lossless change of impedance'],
    engine: 'tdr.tdr: rho, z, zRef at the cursor',
  },
  {
    id: 'tdr-z', title: 'Impedance from the reflection', topic: 'via-tdr', on: 'via', text: 'Z_t = Z_ref*(1 + rho)/(1 - rho)',
    derivation: 'The reflection coefficient solved for the impedance.', engine: 'tdr.tdr: z from rho',
    steps: [
      ['rho*(Z_t + Z_ref) = Z_t - Z_ref', 'the reflection coefficient times its denominator'],
      ['Z_t*(1 - rho) = Z_ref*(1 + rho)', 'the impedance’s terms on one side'],
      ['Z_t = Z_ref*(1 + rho)/(1 - rho)', 'solved'],
    ],
  },
  {
    id: 'tdr-roundtrip', title: 'Round trip on a feed', topic: 'via-tdr', on: 'via', applies: 'line', text: 't_rt = 2*ell_f*sqrt(varepsilon_efff)/c_0',
    derivation: '`delay-lc` there and back.', assumptions: ['the feed measured to the pad’s edge'],
    engine: 'viamodel.viaModel: feeds[i].length, feeds[i].eeff; the feed element’s len/v',
    steps: [
      ['tau_f = ell_f*sqrt(varepsilon_efff)/c_0', 'one way'],
      ['t_rt = 2*tau_f', 'there and back'],
    ],
  },
  // §12 S-parameters (`via-sparams`).
  {
    id: 'abcd-line', title: 'Chain matrix of a line', topic: 'via-sparams', on: 'via', applies: 'line', text: 'A_l = cos(theta_i)',
    where: ['B_l = j*Z_i*sin(theta_i)', 'C_l = j*sin(theta_i)/Z_i', 'theta_i = 2*pi*f*tau_i'],
    derivation: 'Both waves of the telegrapher’s equations, eliminated between the ends.', assumptions: ['lossless'],
    engine: 'viamodel.chainAbcd on a piece of the barrel (pairs: the same per mode)',
    steps: [
      ['V_2 = V_p*exp(-j*theta_i) + V_m*exp(j*theta_i)', 'both waves at the far end, with `V_1 = V_p + V_m` at the near end'],
      ['Z_i*I_2 = V_p*exp(-j*theta_i) - V_m*exp(j*theta_i)', 'each wave’s current is its voltage over the line’s impedance'],
      ['V_1 = V_p + V_m = cos(theta_i)*V_2 + j*Z_i*sin(theta_i)*I_2', 'the waves eliminated'],
      ['Z_i*I_1 = V_p - V_m = j*sin(theta_i)*V_2 + cos(theta_i)*Z_i*I_2', 'the same for the current'],
      ['[V_1; I_1] = [A_l, B_l; C_l, A_l]*[V_2; I_2]', 'as a matrix'],
    ],
  },
  {
    id: 'abcd-shunt', title: 'Chain matrix of a shunt capacitance', topic: 'via-sparams', on: 'via', applies: 'line', text: 'C_sh = j*2*pi*f*Delta_C',
    extra: '\\quad (A = D = 1,\\ B = 0)', derivation: 'The node: V₁ = V₂ and I₁ = I₂ + jωΔC·V₂.', engine: 'viamodel.chainAbcd on a node’s shunt element',
  },
  {
    id: 's-abcd', title: 'S-parameters from the chain matrix', topic: 'via-sparams', on: 'via', applies: 'line',
    text: 'S_21 = 2/(A_c + B_c/Z_ref + C_c*Z_ref + D_c)', where: ['S_11 = (A_c + B_c/Z_ref - C_c*Z_ref - D_c)/(A_c + B_c/Z_ref + C_c*Z_ref + D_c)'],
    derivation: 'The port waves of a two-port with its second port matched.', assumptions: ['equal real reference impedances'],
    engine: 'viamodel.chainAbcd on the whole chain against nport.s',
    steps: [
      ['V_1 = a_1 + b_1', 'port 1’s waves'],
      ['I_1 = (a_1 - b_1)/Z_ref', 'and its current'],
      ['V_2 = b_2 = Z_ref*I_2', 'port 2 matched, the current out of the network'],
      ['a_1 + b_1 = A_c*V_2 + B_c*I_2 = (A_c + B_c/Z_ref)*b_2', 'the chain matrix'],
      ['a_1 - b_1 = Z_ref*(C_c*V_2 + D_c*I_2) = (C_c*Z_ref + D_c)*b_2', 'its second row'],
      ['S_21 = b_2/a_1 = 2/(A_c + B_c/Z_ref + C_c*Z_ref + D_c)', 'the sum of the two'],
      ['S_11 = b_1/a_1 = (A_c + B_c/Z_ref - C_c*Z_ref - D_c)/(A_c + B_c/Z_ref + C_c*Z_ref + D_c)', 'their difference over their sum'],
    ],
  },
  {
    id: 's-db', title: 'S-parameters in decibels', topic: 'via-sparams', on: 'via', applies: 'line', text: 'S_dB = 20*log10(abs(S_21))',
    derivation: 'The definition (a power ratio in dB).', engine: 'nport.s at the frequency',
  },
  {
    id: 'mixed-mode-s', title: 'Mixed-mode S-parameters', topic: 'via-sparams', on: 'via', applies: 'pair',
    text: 'S_dd11 = (S_11 - S_12 - S_21 + S_22)/2',
    where: ['S_dd21 = (S_31 - S_32 - S_41 + S_42)/2', 'S_cc11 = (S_11 + S_12 + S_21 + S_22)/2', 'S_cd21 = (S_31 - S_32 + S_41 - S_42)/2'],
    sources: [src('BockelmanEisenstadt1995', '')], derivation: 'Mixed-mode power waves; the whole matrix is M·S·Mᵀ.',
    assumptions: ['ports 1, 2 the first pair and 3, 4 the second, references 2Z₀ and Z₀/2'], engine: 'nport.toMixedMode: mixed.s against nport.s',
    steps: [
      ['a_d1 = (a_1 - a_2)/sqrt(2)', 'the differential wave into the first pair'],
      ['b_d1 = (b_1 - b_2)/sqrt(2)', 'and out of it'],
      ['b_1 = S_11*a_1 + S_12*a_2', 'the single-ended matrix, nothing into the second pair'],
      ['b_2 = S_21*a_1 + S_22*a_2', 'its second row'],
      ['S_dd11 = b_d1/a_d1 = (S_11 - S_12 - S_21 + S_22)/2', 'a differential drive alone, `a_2 = -a_1`'],
    ],
  },
];

const m = 'm', F = 'F', H = 'H', s = 's', Hz = 'Hz', O = 'Ω';
/** Meanings of the via entries' names (their steps' too). */
export const VIA_SYMBOLS: Readonly<Record<string, SymbolInfo<EmObject>>> = {
  Z_vac: sym('the barrel’s impedance with every dielectric replaced by vacuum', O, 'via'),
  varepsilon_ri: sym('relative permittivity of piece i of the barrel', '', 'piece'),
  Z_i: sym('impedance of piece i of the barrel', O, 'piece'), tau_i: sym('delay of piece i', s, 'piece'), ell_i: sym('length of piece i', m, 'piece'),
  C_0p: sym('the cut’s capacitance per unit length in vacuum (one barrel)', 'F/m', 'via'),
  Cp: sym('the barrel’s capacitance per unit length', 'F/m', 'piece'), Lp: sym('the barrel’s inductance per unit length', 'H/m', 'piece'),
  eta_0: sym('impedance of free space', O, 'constant'),
  d: sym('drill diameter of the barrel', m, 'via'), D: sym('diameter of the equivalent coaxial tube, 2·R_eq', m, 'via'),
  a: sym('barrel radius (drill/2)', m, 'via'), R_eq: sym('the return vias’ equivalent coaxial radius', m, 'via'),
  b: sym('radius of a return via', m, 'via'), R: sym('distance of the return vias from the barrel', m, 'via'), N: sym('number of return vias', '', 'via'),
  Z_qc: sym('impedance of the barrel among thin return wires', O, 'formula'),
  phi_a: sym('potential at the barrel', 'V', 'derivation'), phi_b: sym('potential at a return via', 'V', 'derivation'),
  q: sym('the barrel’s charge per unit length', 'C/m', 'derivation'), varepsilon: sym('permittivity of the material', 'F/m', 'derivation'),
  L_sec: sym('inductance of the via section', H, 'via'), L_over: sym('inductance the feeds add over their antipads', H, 'via'), C_sec: sym('capacitance of the via section', F, 'via'),
  ell_th: sym('length of the barrel between the signal layers', m, 'via'), L_ip: sym('the barrel’s inductance per unit length (every material)', 'H/m', 'piece'),
  C_ip: sym('capacitance per unit length of piece i', 'F/m', 'piece'),
  C_1p: sym('capacitance per unit length of piece 1', 'F/m', 'piece'), C_2p: sym('capacitance per unit length of piece 2', 'F/m', 'piece'),
  ell_1: sym('length of piece 1', m, 'piece'), ell_2: sym('length of piece 2', m, 'piece'),
  C_line: sym('capacitance of the barrel’s pieces', F, 'via'), Delta_Csum: sym('capacitance the pads and openings add', F, 'node'),
  C_axi: sym('the axisymmetric whole-via capacitance', F, 'via'),
  Z_sec: sym('impedance of the via section as one element', O, 'via'), tau_sec: sym('delay of the via section', s, 'via'),
  L_s11: sym('the section’s inductance matrix, (1, 1)', H, 'via'), L_s12: sym('the section’s inductance matrix, (1, 2)', H, 'via'),
  C_s11: sym('the section’s capacitance matrix, (1, 1)', F, 'via'), C_s12: sym('the section’s capacitance matrix, (1, 2)', F, 'via'),
  Z_diffsec: sym('differential impedance of the via section', O, 'via'), Z_cmsec: sym('common-mode impedance of the via section', O, 'via'),
  Z_oddsec: sym('odd-mode impedance of the via section', O, 'via'), Z_evensec: sym('even-mode impedance of the via section', O, 'via'),
  k_12: sym('the cut’s coupling ratio −C₁₂′/C₁₁′', '', 'via'), Delta_C: sym('capacitance a node’s pad and opening add', F, 'node'),
  Delta_C12: sym('the coupling between the two vias’ pads at a node', F, 'node'), C_0p12: sym('the cut’s vacuum capacitance per unit length, (1, 2)', 'F/m', 'via'),
  Z_secx: sym('the section’s impedance at the size found', O, 'via'), Z_target: sym('the impedance asked for', O, 'via'),
  Z_x: sym('the trace’s impedance at the size found', O, 'line'),
  f_mn: sym('resonance (m, n) of the plane pair', Hz, 'formula'), m_c: sym('mode number along a', '', 'formula'), n_c: sym('mode number along b', '', 'formula'),
  a_x: sym('length of the board', m, 'formula'), b_y: sym('width of the board', m, 'formula'), x_c: sym('position along a', m, 'derivation'),
  y_c: sym('position along b', m, 'derivation'), E_z: sym('vertical field of the mode', '', 'derivation'), k_c: sym('wavenumber of the mode', '1/m', 'derivation'),
  Z_in: sym('input impedance of the stub', O, 'stub'), Z_s: sym('impedance of the stub’s piece', O, 'stub'),
  theta_s: sym('electrical length of the stub’s piece', 'rad', 'stub'), tau_s: sym('delay of the stub’s piece', s, 'stub'),
  A_s: sym('chain matrix of the stub’s piece, A', '', 'stub'), C_s: sym('chain matrix of the stub’s piece, C', 'S', 'stub'),
  f_stub: sym('quarter-wave frequency of the stub without its pads', Hz, 'stub'), tau_stub: sym('one-way delay of the stub', s, 'stub'),
  theta_q: sym('electrical length of the stub', 'rad', 'stub'), ell_s: sym('length of the stub', m, 'stub'),
  varepsilon_effs: sym('effective permittivity of the stub', '', 'stub'),
  f_valid: sym('frequency to which the model’s lumped parts hold', Hz, 'via'), ell_w: sym('length of the longest lumped window', m, 'node'),
  varepsilon_rw: sym('relative permittivity of that window', '', 'node'), lambda_w: sym('wavelength in that window', m, 'node'),
  f_3: sym('the edge’s bandwidth (−3 dB)', Hz, 'drive'), sigma_e: sym('standard deviation of the Gaussian edge', s, 'drive'),
  z_90: sym('the normal quantile of 0.9', '', 'constant'), H: sym('spectrum of the edge relative to a sharp step', '', 'drive'),
  f_end: sym('the sweep’s last frequency (edge at −60 dB)', Hz, 'drive'), L_e: sym('the sweep’s level', '', 'constant'),
  f_band: sym('the flags’ band (edge at −20 dB)', Hz, 'drive'), L_b: sym('the band’s level', '', 'constant'),
  f_L: sym('where the edge’s spectrum falls to L_x', Hz, 'drive'), L_x: sym('a level of the spectrum', '', 'drive'),
  rho: sym('reflected step (incident 1)', '', 'port'), Z_t: sym('impedance the TDR shows', O, 'port'), Z_ref: sym('reference impedance of the ports', O, 'port'),
  t_rt: sym('round trip on the feed', s, 'feed'), ell_f: sym('length of the feed to the pad’s edge', m, 'feed'),
  varepsilon_efff: sym('effective permittivity of the feed', '', 'feed'), tau_f: sym('one-way delay of the feed', s, 'feed'),
  A_l: sym('chain matrix of the piece, A (and D)', '', 'piece'), B_l: sym('chain matrix of the piece, B', O, 'piece'),
  C_l: sym('chain matrix of the piece, C', 'S', 'piece'), theta_i: sym('electrical length of piece i', 'rad', 'piece'),
  V_m: sym('amplitude of the wave travelling back', 'V', 'derivation'),
  C_sh: sym('chain matrix of a node, C', 'S', 'node'),
  A_c: sym('chain matrix of the whole via, A', '', 'via'), B_c: sym('chain matrix of the whole via, B', O, 'via'),
  C_c: sym('chain matrix of the whole via, C', 'S', 'via'), D_c: sym('chain matrix of the whole via, D', '', 'via'),
  a_1: sym('wave into port 1', '', 'port'), b_1: sym('wave out of port 1', '', 'port'), a_2: sym('wave into port 2', '', 'port'), b_2: sym('wave out of port 2', '', 'port'),
  a_d1: sym('differential wave into the first pair', '', 'port'), b_d1: sym('differential wave out of the first pair', '', 'port'),
  S_dB: sym('|S21| in decibels', 'dB', 'port'),
  S_dd11: sym('differential reflection', '', 'port'), S_dd21: sym('differential transmission', '', 'port'),
  S_cc11: sym('common-mode reflection', '', 'port'), S_cd21: sym('differential into common-mode transmission', '', 'port'),
  ...Object.fromEntries([1, 2, 3, 4].flatMap((i) => [1, 2, 3, 4].map((j) => [`S_${i}${j}`, sym(`single-ended S-parameter (${i}, ${j})`, '', 'port')]))),
};

export const VIA_TEX_NAMES: Readonly<Record<string, string>> = {
  varepsilon_ri: '\\varepsilon_{r,i}', C_0p: "C_0'", Cp: "C'", Lp: "L'", L_ip: "L'_i", C_ip: "C'_i", C_1p: "C'_1", C_2p: "C'_2",
  C_0p12: "C_{0,12}'", R_eq: 'R_\\mathrm{eq}', Z_vac: 'Z_\\mathrm{vac}', Z_qc: 'Z_\\mathrm{thin}', Delta_Csum: '\\textstyle\\sum_k \\Delta C_k',
  C_axi: 'C_\\mathrm{via}', C_line: 'C_\\mathrm{line}', L_sec: 'L_\\mathrm{sec}', L_over: 'L_\\mathrm{over}', C_sec: 'C_\\mathrm{sec}', Z_sec: 'Z_\\mathrm{sec}',
  tau_sec: '\\tau_\\mathrm{sec}', ell_th: '\\ell_\\mathrm{through}', L_s11: 'L_{11}', L_s12: 'L_{12}', C_s11: 'C_{11}', C_s12: 'C_{12}',
  Z_diffsec: 'Z_\\mathrm{diff,sec}', Z_cmsec: 'Z_\\mathrm{cm,sec}', Z_oddsec: 'Z_\\mathrm{odd,sec}', Z_evensec: 'Z_\\mathrm{even,sec}',
  Delta_C12: '\\Delta C_{12}', Z_secx: 'Z_\\mathrm{sec}(x)', Z_x: 'Z(x)', Z_target: 'Z_\\mathrm{target}',
  m_c: 'm', n_c: 'n', a_x: 'a', b_y: 'b', x_c: 'x', y_c: 'y', k_c: 'k', f_mn: 'f_{mn}',
  theta_s: '\\theta_s', theta_q: '\\beta\\ell', tau_stub: '\\tau_\\mathrm{stub}', f_stub: 'f_\\mathrm{stub}', varepsilon_effs: '\\varepsilon_\\mathrm{eff}',
  f_valid: 'f_\\mathrm{valid}', ell_w: '\\ell_\\mathrm{w}', varepsilon_rw: '\\varepsilon_{r,\\mathrm{w}}', lambda_w: '\\lambda_\\mathrm{w}',
  sigma_e: '\\sigma', z_90: 'z_{0.9}', f_end: 'f_\\mathrm{end}', f_band: 'f_\\mathrm{band}', L_e: 'L_\\mathrm{end}', L_b: 'L_\\mathrm{band}', L_x: 'L',
  Z_t: 'Z', Z_ref: 'Z_\\mathrm{ref}', t_rt: 't_\\mathrm{rt}', ell_f: '\\ell_\\mathrm{feed}', varepsilon_efff: '\\varepsilon_\\mathrm{eff,feed}',
  tau_f: '\\tau_\\mathrm{feed}', A_l: 'A', B_l: 'B', C_l: 'C', A_c: 'A', B_c: 'B', C_c: 'C', D_c: 'D', A_s: 'A', C_s: 'C', C_sh: 'C',
  S_dB: '|S_{21}|_\\mathrm{dB}', S_dd11: 'S_{dd11}', S_dd21: 'S_{dd21}', S_cc11: 'S_{cc11}', S_cd21: 'S_{cd21}', a_d1: 'a_{d1}', b_d1: 'b_{d1}',
  eta_0: '\\eta_0',
};
