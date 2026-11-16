# EM simulation – the equation list (step M4.1)

Every relation the page displays, for step M4.2's registry (`lib/emsim/equations.ts`) and its derivation dialog. Each
entry: the **id**; its **kind** (**Def** a definition or the tool's own rule, no derivation; **S** printed by a source,
with or without steps; **Der** derived here, from the ids named); the symbols it binds to the engine; the **steps**, each
an equation in the registry's text form (`lib/equations/parse.ts`: names, `+ - * / ^`, `sqrt ln exp cos sin cot`, `j`,
`pi`, matrices `[a, b; c, d]`) with its reason after the dash (maths in a reason between backticks). The TeX of the 33
registered entries is in theory.md and theory-2.md and in the registry; the TeX and live fields of the new ones are in
the Equations tables of [theory-vias.md](theory-vias.md) (§ named) and, for `target`, below. Symbols of the new entries
are SI as the registry's: Ω, F, H, s, m, Hz (the page converts to mm, fF, nH, ps, GHz).

**Derivation tree** (an arrow: "is derived from"): `telegraph` → `z0-lc`, `delay-lc`; `l-c0` + `eeff-c` + `delay-lc` →
`v-eeff` → `lambda-eeff`; `getsinger` → `getsinger-limit`; `error-shown`'s model → `order`; `mixed-mode-vars` →
`zodd-sym`, `zeven-sym` → `zdiff-zodd`; Zc matrix (facts.md §4) → `zdd-zc`, `zcc-zc`, `zdc-zc`, `zdiff-b`, `ztdr`;
`kf` → `fext-pulse`; `v-eeff` → `eeff-mode`; `delay-lc` → `mode-skew`; `sens` → `rss-sigma`; `z0-lc` + `l-c0` →
`via-barrel-z`, `via-barrel-delay` → `via-coax` → `via-req`; `via-quasi-coax` (own steps); `l-c0` → `via-section-l`;
`via-dc` → `via-section-c`; `z0-lc`, `delay-lc` → `via-section-z`, `via-section-delay`; `zodd-sym` + `zeven-sym` →
`via-section-pair`; `telegraph` → `abcd-line` → `stub-zin` → `stub-quarter`; `abcd-line`, `abcd-shunt` → `s-abcd`;
`mixed-mode-vars` → `mixed-mode-s`; `tdr-rho` → `tdr-z`; `delay-lc` → `tdr-roundtrip`; the Gaussian edge → `edge-f3`,
`edge-band`.

---

## Registered in M2.4b (33): steps to add

**transmission-lines**
- `telegraph` – Def (the line as series L and shunt C per length).
- `z0-lc` – S [Ellingson2018 §3.12], Der from `telegraph`. 1. `-dV/dz = j*omega*L*I` – phasors at angular frequency
  `omega`. 2. `-dI/dz = j*omega*C*V` – the same for the current. 3. `V = V_p*exp(-j*beta*z)` – a wave travelling to +z.
  4. `beta*V_p = omega*L*I_p` – step 1 on that wave. 5. `beta = omega*sqrt(L*C)` – steps 1 and 2 together.
  6. `Z_0 = V_p/I_p = omega*L/beta = sqrt(L/C)` – the wave's voltage over its current.
- `delay-lc` – Der from `z0-lc`. 1. `v = omega/beta = 1/sqrt(L*C)` – step 5 above. 2. `tau = 1/v = sqrt(L*C)`.
- `eeff-c` – Def.
- `l-c0` – S [Paul2008], Der. 1. `1/sqrt(L*C_0) = c_0` – in vacuum the line is TEM at the speed of light.
  2. `L = 1/(c_0^2*C_0) = mu_0*varepsilon_0/C_0` – L does not depend on non-magnetic dielectrics (matrices: `C_0^-1`).
- `v-eeff` – S [Ellingson2018 §3.11], Der from `delay-lc`, `l-c0`, `eeff-c`. 1. `L*C = mu_0*varepsilon_0*C/C_0` –
  `l-c0`. 2. `L*C = varepsilon_eff/c_0^2` – `eeff-c`. 3. `v = 1/sqrt(L*C) = c_0/sqrt(varepsilon_eff)`.
- `lambda-eeff` – S [Ellingson2018 §3.11], Der from `v-eeff`. 1. `lambda = v/f = c_0/(f*sqrt(varepsilon_eff))`.
  2. `lambda = lambda_0/sqrt(varepsilon_eff)` – with `lambda_0 = c_0/f`.
- `getsinger` – S [QucsTech §11.1] [Getsinger1973] (an empirical model; no steps).
- `getsinger-limit` – Der from `getsinger`. 1. `varepsilon_f - varepsilon_eff = (varepsilon_r - varepsilon_eff)*y/(1 + y)`
  – with `y = G*(f/f_p)^2`. 2. `(varepsilon_r - varepsilon_eff)*y/(1 + y) = delta*varepsilon_eff` – the rise equals
  the error. 3. `y = delta*varepsilon_eff/(varepsilon_r - varepsilon_eff - delta*varepsilon_eff)` – solved for y.
  4. `f_lim = f_p*sqrt(y/G) = f_p*sqrt(x)` – x as the registry writes it.

**field-solver**
- `charge-potential` – Def, S [Paul2008].
- `error-shown` – Def (the tool's rule, bem2d.estimateOf), with its motive in steps. 1. `X_M = X + k*h^p` – the error
  of order p at panel size h. 2. `X_M2 - X_M = k*h^p*(2^p - 1)` – the coarser level has panels 2h. 3.
  `X_M - X = (X_M2 - X_M)/(2^p - 1)` – at most the difference when `p >= 1`; the factor 1.5 is a margin.
- `order` – Der from the model of `error-shown`. 1. `X_M4 - X_M2 = 2^p*(X_M2 - X_M)` – step 2 at 2h and 4h.
  2. `p = ln(abs(X_M2 - X_M4)/abs(X_M - X_M2))/ln(2)`.

**pairs**
- `mixed-mode-vars` – Def, S [BockelmanEisenstadt1995] beside facts.md §5.
- `zodd-sym` – Der from `mixed-mode-vars` and `charge-potential`. 1. `V_2 = -V_1` – the odd mode of a symmetric pair.
  2. `Q_1 = (C_11 - C_12)*V_1` – row 1 of `Q = C*V`. 3. `Psi_1 = (L_11 - L_12)*I_1` – the flux likewise, with `I_2 = -I_1`.
  4. `Z_odd = sqrt((L_11 - L_12)/(C_11 - C_12))` – `z0-lc` on the mode.
- `zeven-sym` – Der, the same with `V_2 = V_1`: `Z_even = sqrt((L_11 + L_12)/(C_11 + C_12))`.
- `zdiff-zodd` – S [PolarAP157], Der from `mixed-mode-vars`. 1. `V_d = V_1 - V_2 = 2*V_1` and `I_d = I_1` – odd mode.
  2. `Z_diff = V_d/I_d = 2*Z_odd`. 3. `V_c = V_1` and `I_c = 2*I_1` – even mode. 4. `Z_cm = V_c/I_c = Z_even/2`.
- `zdd-zc` – Der from `V = Z_c*I` (facts.md §4). 1. `I_1 = I_d` and `I_2 = -I_d` – no common current. 2.
  `V_1 - V_2 = (Z_c11 - Z_c12 - Z_c21 + Z_c22)*I_d`. 3. `Z_diff = Z_c11 + Z_c22 - 2*Z_c12` – Zc is symmetric.
- `zcc-zc` – Der. 1. `I_1 = I_2 = I_c/2`. 2. `V_c = (V_1 + V_2)/2 = (Z_c11 + 2*Z_c12 + Z_c22)*I_c/4`.
- `zdc-zc` – Der. 1. `I_1 = I_2 = I_c/2`. 2. `V_1 - V_2 = (Z_c11 - Z_c22)*I_c/2` – the differential voltage a common
  current makes.
- `zdiff-b` – Der from `Y_c = Z_c^-1`. 1. `V_1 = V_d/2` and `V_2 = -V_d/2` – voltage drive. 2.
  `I_d = (I_1 - I_2)/2 = (Y_c11 + Y_c22 - 2*Y_c12)*V_d/4`. 3. `Z_diffB = V_d/I_d`. 4. `V_1 = V_2 = V_c`,
  `I_c = I_1 + I_2 = (Y_c11 + Y_c22 + 2*Y_c12)*V_c` – for `Z_cmB`.
- `ztdr` – Der (notes-M0.2e.md item 2). 1. `V_d = Z_dd*I_d + Z_dc*I_c`. 2. `V_c = Z_dc*I_d + Z_cc*I_c`. 3.
  `V_c = -R_TDR*I_c` – the two sources' common mode. 4. `I_c = -Z_dc*I_d/(Z_cc + R_TDR)`. 5.
  `Z_TDR = V_d/I_d = Z_dd - Z_dc^2/(Z_cc + R_TDR)`.
- `kb` – S [Paul2008] [Bogatin2018], Der (facts.md §6). 1. `V_b = (C_m/C_11 + L_m/L_11)*V/4` – the capacitive and
  inductive coupled currents add towards the near end (weak coupling, matched ends); `k_b = V_b/V`.
- `kf` – S as `kb`, Der (facts.md §6). 1. `V_f = (C_m/C_11 - L_m/L_11)*ell*V_r/(2*v_c*t_r)` – towards the far end they
  subtract, growing with length and slope; `k_f` is the factor of `ell*V_r/t_r`.
- `fext-pulse` – Der from `kf`. 1. `dV/dt = V_r/t_r` – a linear ramp. 2. `V_FEXT = k_f*ell*V_r/t_r`.
- `eeff-mode` – Der from `v-eeff` on each mode: `varepsilon_effm = (c_0/v_m)^2`.
- `mode-skew` – Der from `delay-lc`: `Delta_tau = (tau_even - tau_odd)*ell` – each mode's delay over the length.

**calculators**
- `pct-diff` – Def.
- `parts-sum` – Def with one step. 1. `Delta_Z = Delta_er + Delta_cu + Delta_etch + Delta_mask + Delta_rest` – changing
  the parts one after another is exact; each part alone leaves out how they interact (`Delta_rest`: 0.012 Ω on D).

**tolerances**
- `sens` – Def with one step. 1. `Z(x_i + t_i) - Z(x_i - t_i) = 2*Z'*t_i` – to first order, so `d_i = Z'*t_i`.
- `share` – Def. `corners` – Def. `mc-normal` – Def (t as 3σ).
- `rss-sigma` – Der from `sens`, `mc-normal`. 1. `Z - Z_0 = d_1*u_1 + d_2*u_2` (and so on) – linear, with
  `u_i = (x_i - x_bar)/t_i`. 2. `sigma_u = 1/3` – `mc-normal`. 3. `sigma^2 = S_d/9` – independent inputs.

---

## New for vias, the TDR, S-parameters and the target (28)

Engine: `viamodel.viaModel` unless named. "Binds" lists the symbols with their fields.

- `via-barrel-z` (§7) – Der from `l-c0`, `z0-lc`. Binds Z_vac `barrel.zVac`, ε_r,i `pieces[i].er`, Z_i `pieces[i].z0`
  (pair: `zdiffVac` → `pieces[i].zdiff`, `zcmVac` → `zcm`). 1. `C' = varepsilon_r*C_0'` – one material fills the cut.
  2. `L' = mu_0*varepsilon_0/C_0'` – `l-c0`. 3. `Z_i = sqrt(L'/C') = 1/(c_0*C_0'*sqrt(varepsilon_r))`. 4.
  `Z_vac = 1/(c_0*C_0')` – the same cut in vacuum, so `Z_i = Z_vac/sqrt(varepsilon_r)`.
- `via-barrel-delay` (§7) – Der from `delay-lc`. Binds ℓ_i `pieces[i].zTop - zBot`, τ_i `pieces[i].delay`. 1.
  `sqrt(L'*C') = sqrt(varepsilon_r)/c_0` – steps 1–2 above. 2. `tau_i = ell_i*sqrt(varepsilon_r)/c_0`.
- `via-coax` (§7) – S [WikiCapacitance] (concentric cylinders), Der. Binds d `via.drill`, D = 2·`wall.Req`. 1.
  `C' = 2*pi*varepsilon_0*varepsilon_r/ln(D/d)` – the coaxial capacitance. 2. `Z = sqrt(varepsilon_r)/(c_0*C')` –
  `via-barrel-z`. 3. `Z = eta_0*ln(D/d)/(2*pi*sqrt(varepsilon_r))` – with `eta_0 = 1/(varepsilon_0*c_0)`.
- `via-quasi-coax` (§7) – Der (facts-formulas.md §7), thin wires (a, b ≪ R). Binds a = drill/2, b = return drill/2,
  R `nearestReturn(via)`, N `via.returns.length`; single via with every return at R. 1.
  `phi_a = q*ln(R/a)/(2*pi*varepsilon)` – the barrel's own charge q and N charges `-q/N` at R. 2.
  `phi_b = -q*ln(R/(N*b))/(2*pi*varepsilon*N)` – at a return: its own charge, the barrel at R and the others, using
  that the product of `abs(1 - exp(2*pi*j*k/N))` over k = 1 … N − 1 is N. 3.
  `C' = q/(phi_a - phi_b) = 2*pi*varepsilon/(ln(R/a) + ln(R/(N*b))/N)`. 4. `Z = sqrt(varepsilon_r)/(c_0*C')`.
- `via-req` (§7) – Der from `via-coax`. Binds a = drill/2, C0′ = 1/(c0·`barrel.zVac`), R_eq `wall.Req`. 1.
  `C_0' = 2*pi*varepsilon_0/ln(R_eq/a)` – the coax with the cut's vacuum capacitance. 2.
  `R_eq = a*exp(2*pi*varepsilon_0/C_0')`.
- `via-section-l` (§7) – Der from `l-c0`. Binds `lumped.L`. 1. `L_i' = mu_0*varepsilon_0/C_0' = Z_vac/c_0` – the same
  in every material. 2. `L = L_1'*ell_1 + L_2'*ell_2` (and so on) – lines in series add.
- `via-section-c` (§7) – Der from `via-dc`. Binds `lumped.lineC`, `lumped.dCsum`, `lumped.C`. 1.
  `C_i' = varepsilon_ri*C_0'`. 2. `C = C_line + Delta_C_sum` – shunt capacitances add; a pair adds the matrix
  `[Delta_C, -k_12*Delta_C; -k_12*Delta_C, Delta_C]` (`via-pad-coupling`).
- `via-section-z` (§7) – Der from `z0-lc`: the whole section as one LC element, short against λ (`lambda8`). Binds
  `lumped.z`.
- `via-section-delay` (§7) – Der from `delay-lc`. Binds `lumped.delay` (a pair: the odd mode's
  `sqrt((L_11 - L_12)*(C_11 - C_12))`).
- `via-section-pair` (§7) – Der from `zodd-sym`, `zeven-sym`, `zdiff-zodd` on the section's matrices. Binds
  `lumped.L`, `lumped.C`, `lumped.zdiff`, `lumped.zcm`. 1. `Z_diff = 2*Z_odd`. 2. `Z_cm = Z_even/2`.
- `via-dc` (§8) – Def (notes-M1.7.md "The wall"): window charge at 1 V less the barrel line's. Binds `nodes[k].dC`,
  `nodes[k].dCErr`. Check (no step): `C_line + Delta_C_sum` equals the axisymmetric total `axiTotal` to 1e-12.
- `via-pad-coupling` (§8) – Def, an estimate (engine.md §6.3, solver.md §5.2). Binds `barrel.k12`. 1.
  `k_12 = -C_12'/C_11'` – the cut's coupling ratio. 2. `Delta_C12 = -k_12*Delta_C` – the pads' excess assumed to
  couple in the same ratio.
- `via-target` (§8) – Def: the root of `Z_sec(x) - Z_target` over the searched range (`viaTarget`, the root finder
  of engine.md §4). Binds `.x`, `.value`, `.range`, `.values`; "out of reach" when the values at both ends lie on
  one side.
- `target` (trace Tools) – Def: TeX `Z(x) = Z_\mathrm{target}` with x the width, the gap or both scaled
  (`inverse.inverse`: `.w`, `.s`, `.value`, `.range`). Live: the default's 50 Ω at w 0.14653 mm.
- `cavity-f` (§9) – Der (facts.md §2). 1. `E_z = cos(m*pi*x/a)*cos(n*pi*y/b)` – open edges as magnetic walls. 2.
  `k^2 = (m*pi/a)^2 + (n*pi/b)^2` – the wave equation in the plane pair. 3. `f_mn = c_0*k/(2*pi*sqrt(varepsilon_r))`.
- `stub-zin` (§10) – S [SteerVol2 §2.4] [Ellingson2018 §3.16], Der from `abcd-line`. 1. `I_2 = 0` – the open end.
  2. `Z_in = V_1/I_1 = A/C`. 3. `Z_in = cos(beta*ell)/(j*sin(beta*ell)/Z_0) = -j*Z_0*cot(beta*ell)`.
- `stub-quarter` (§10) – Der from `stub-zin`. Binds `stubs[i].length`, `.delay`, `.fFormula`; `.fRes` (with the pads:
  the first zero of A of the stub's chain, `stubResonance`). 1. `cot(beta*ell) = 0` – a short at `beta*ell = pi/2`.
  2. `beta*ell = 2*pi*f*tau` – τ the one-way delay. 3. `f_stub = 1/(4*tau) = c_0/(4*ell*sqrt(varepsilon_eff))`.
- `lambda8` (§13) – Def (the tool's rule after [Cartier2007 abstract]). Binds `valid.fMax`, `valid.reason`. 1.
  `ell = lambda/8` with `lambda = c_0/(f*sqrt(varepsilon_r))`. 2. `f_valid = c_0/(8*ell*sqrt(varepsilon_r))`.
- `edge-f3` (§11) – Der (facts-formulas.md §8). Binds `tr`, `f3`. 1. `t_r = 2*1.28155*sigma` – 10 % and 90 % of a
  Gaussian edge lie 1.28155σ either side of its middle. 2. `abs(H) = exp(-(2*pi*f*sigma)^2/2)` – a step smoothed by a
  Gaussian. 3. `2*pi*f_3*sigma = sqrt(ln(2))` – where `abs(H) = 1/sqrt(2)`. 4.
  `f_3*t_r = 2*1.28155*sqrt(ln(2))/(2*pi) = 0.3396`.
- `edge-band` (§11) – Der from step 2 of `edge-f3`. Binds `band`, `nport.f` (last). 1.
  `f_L = sqrt(2*ln(1/L))/(2*pi*sigma)` – where `abs(H) = L`. 2. `f_L/f_3 = sqrt(2*ln(1/L)/ln(2))` – 2.578 at L = 0.1,
  4.465 at L = 0.001.
- `tdr-rho` (§11) – S [Ellingson2018 §3.12] (the reflection coefficient; opened for the Smith chart): late in a step's
  reflection from a lossless change of impedance, ρ is Γ of the impedance met. Binds `tdr.rho`.
- `tdr-z` (§11) – Der from `tdr-rho`. Binds `tdr.zRef`, `tdr.z`. 1. `rho*(Z + Z_ref) = Z - Z_ref`. 2.
  `Z*(1 - rho) = Z_ref*(1 + rho)`. 3. `Z = Z_ref*(1 + rho)/(1 - rho)`.
- `tdr-roundtrip` (§11) – Der from `delay-lc`. Binds `feeds[i].length` (to the pad's edge), `feeds[i].eeff`. 1.
  `tau = ell*sqrt(varepsilon_eff)/c_0` – one way. 2. `t = 2*tau` – there and back.
- `abcd-line` (§12) – Der from `telegraph` (waves of `z0-lc`). Binds `pieces[i].z0`, `.delay`, f. 1.
  `V(z) = V_p*exp(-j*beta*z) + V_m*exp(j*beta*z)` – both waves. 2. `I(z) = (V_p*exp(-j*beta*z) - V_m*exp(j*beta*z))/Z`.
  3. `[V_1; I_1] = [cos(beta*ell), j*Z*sin(beta*ell); j*sin(beta*ell)/Z, cos(beta*ell)]*[V_2; I_2]` – eliminating the
  waves between z = 0 and ℓ. (Pairs: the same per mode, the engine's `LineSpec` with C and T.)
- `abcd-shunt` (§12) – Def: `V_1 = V_2` and `I_1 = I_2 + j*omega*Delta_C*V_2`. Binds `nodes[k].dC`.
- `s-abcd` (§12) – Der from the port waves. Binds `nport.s`, `nport.z0`. 1. `V_1 = a_1 + b_1` and
  `I_1 = (a_1 - b_1)/Z_0` – port 1's waves. 2. `V_2 = b_2` and `I_2 = b_2/Z_0` – port 2 matched (`a_2 = 0`), current
  out of the network. 3. `a_1 + b_1 = (A + B/Z_0)*b_2` and `a_1 - b_1 = (C*Z_0 + D)*b_2` – the ABCD relations. 4.
  `S_21 = b_2/a_1 = 2/(A + B/Z_0 + C*Z_0 + D)`. 5. `S_11 = b_1/a_1 = (A + B/Z_0 - C*Z_0 - D)/(A + B/Z_0 + C*Z_0 + D)`.
- `s-db` (§12) – Def: `S_dB = 20*log10(abs(S))`.
- `mixed-mode-s` (§12) – S [BockelmanEisenstadt1995] beside the derivation, Der from `mixed-mode-vars` in power
  waves (facts.md §5). Binds `nport.s`, `mixed.s`, `mixed.z0`. 1. `a_d = (a_1 - a_2)/sqrt(2)` and
  `a_c = (a_1 + a_2)/sqrt(2)` (b likewise) – references 2Z0 and Z0/2. 2. `a_mm = M*a` and `b_mm = M*b`. 3.
  `S_mm = M*S*M^-1 = M*S*M^T` – M is orthogonal.

**Counts.** 33 registered + 28 new = 61. New definitions without steps or with a rule only: `via-dc`, `via-target`,
`target`, `abcd-shunt`, `s-db`, `lambda8` (one rule step), `via-pad-coupling` (an estimate). `tdr-rho` is a source
statement. The rest have steps that M4.2 checks numerically (each step equal to the next on random inputs).
