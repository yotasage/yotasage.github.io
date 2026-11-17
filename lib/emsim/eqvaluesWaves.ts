// The numbers the full-wave equations (lib/emsim/equationsWaves.ts) are printed with (step M7.2d): one flat SI binding
// (m, s, Hz) from the Waves section's estimate before a run (fullwave.preview: the mesh's smallest cells, the model's
// largest cell and permittivity, est's Δt, T, τrt, steps, cells and rate, the pulse of fdtd/ports.ts pulseOf) and, after
// a run for the same setup, the run's own (the last frequency of its S, the ports' reference impedances, the frames).
// Framework-free: the Theory chunk and the harness use it alike.

import { COURANT } from './fdtd/model';
import { pulseOf } from './fdtd/ports';
import type { FdtdResult } from './fdtd/job';
import type { Preview } from './fullwave';

export const C0 = 299792458; // m/s
/** fdtd/run.ts F_S (kept here so the Theory chunk does not load the run's code): S up to 0.816·f_run. */
export const F_S_RUN = 0.816;
/** fdtd/model.ts largestCell's band: where the edge's spectrum is 20 dB down, 0.877/tr. */
export const F_HI_TR = 0.877;

/** The flat binding of the full-wave entries; empty before the estimate has a mesh. */
export function wavesBinding(pv: Preview | null, res: FdtdResult | null = null): Record<string, number> {
  if (!pv || !pv.est || !pv.minCell) return {};
  const e = pv.est, tr = pv.model.trMin, p = pulseOf(tr);
  const [dx, dy, dz] = pv.minCell.map((x) => x * 1e-3);
  const f_hi = F_HI_TR / tr, er = pv.geom.erMax;
  const nPorts = pv.ports.length;
  const fS = res && res.nport.f.length ? res.nport.f[res.nport.f.length - 1] : F_S_RUN * p.fRun;
  return {
    c_0: C0, S_c: COURANT, Delta_x: dx, Delta_y: dy, Delta_z: dz, Delta_t: e.dt,
    t_r: tr, f_hi, varepsilon_rmax: er, lambda_hi: C0 / (f_hi * Math.sqrt(er)), Delta_max: pv.geom.hmax * 1e-3,
    f_run: p.fRun, sigma_p: p.sigma, t_0: p.t0, f_S: fS,
    tau_rt: e.tauRt, T_run: e.T, N_t: e.steps,
    N_cells: e.cells, N_ports: nPorts, R_c: e.rate, W_u: e.cells * e.steps * nPorts, t_run: e.seconds * nPorts,
  };
}
