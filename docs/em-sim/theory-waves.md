# EM simulation – theory of full-wave runs and the waves (step M7.2c)

The source text of the page's topic on the full-wave solver and its animation, read as [theory.md](theory.md) says
("How to read these files"): ids are page anchors, `⟨n⟩` is the claim's number in [claims.md](claims.md) (242–313),
`[key §x]` a citation; a key marked "not opened" in [sources.md](sources.md) stands only beside the opened source or
the derivation named in its claim row. Equations are ids of [equations-list.md](equations-list.md) ("New for
full-wave runs"). **Live numbers** are fields of `Preview` (`lib/emsim/fullwave.ts`, `preview(setup, spec, dev)`:
`est` is the `Estimate` of `lib/emsim/fdtd/estimate.ts`) before a run and of `FdtdResult` (`lib/emsim/fdtd/job.ts`) after
it, unless named otherwise. Values in brackets are those of **V**, the default via (theory-vias.md's V: 0.6/0.3,
antipads Ø1.8, two returns at 0.8 mm, on JLC061611-3313A) run at 35 ps, or of **C45**, the via-pair preset with its
feeds turned to 180° and 0° as the openEMS fixture has them; every one checked in Node or against
`scripts/harness/emsim/openems/compare.json` ([notes-M7.2c.md](notes-M7.2c.md) "Numbers checked"). Step M7.2d puts
this topic on the page after §13 and links the Waves section's short lines to it (done: `components/EmSim/TheoryWaves.tsx`,
[notes-M7.2d.md](notes-M7.2d.md)).

| § | Topic | Id | Sub-anchors |
|---|---|---|---|
| 14 | Full-wave runs and the waves | `full-wave` | `fw-why`, `fw-yee`, `fw-mesh`, `fw-edges`, `fw-ports`, `fw-cost`, `fw-read`, `fw-pair`, `fw-3d`, `fw-checked` |

---

## 14. Full-wave runs and the waves

### Why a full-wave run (`fw-why`)

The Via section's model joins short lines and lumped capacitances, each solved in 2D or around one axis; that makes it
fast enough to follow a drag, and it leaves out what does not fit that picture (#via-limits). ⟨242⟩ Three things
matter most on a board: the radial wave the barrel launches between two planes (#via-return), a feed that runs over
its plane's antipad and so has no plane under it there, and return vias far from the barrel, whose current then takes
a wide path through the planes. ⟨243⟩ A full-wave run solves Maxwell's equations themselves in 3D, over the via with
its feeds and the board around it, so all three are in it without a model of their own. ⟨244⟩

On the default via, before the via model took the feeds' runs over the antipads in, it read the via's section at
49.7 Ω; the full-wave runs read 73.1 Ω (this tool) and 68.9 Ω (openEMS), and the model now reads 67.9 Ω. ⟨245⟩ The
Via section suggests a run when a feed crosses its antipad by more than 0.1 mm, when the nearest return via is more
than 1.5 mm away or there is none, when the edge's band reaches past the model's, or when a stub resonates within
twice the band. ⟨246⟩ The default via at 35 ps is one of these: its band reaches 25.0 GHz, the model's 20.8 GHz.
⟨247⟩ The same run also stores slices of the field, which the Waves player shows. ⟨248⟩

### How FDTD works (`fw-yee`)

The tool's full-wave solver is the finite-difference time-domain method (FDTD): space is cut into small boxes and time
into small steps, and the fields are stepped forward from an empty start [WikiFDTD]. ⟨249⟩ In Yee's scheme the
electric field's components lie on the edges of each box and the magnetic field's on its faces, half a cell apart,
so that every E component sits between the H components that circle it and the other way round [WikiFDTD] [Yee1966] [TafloveHagness2005]. ⟨250⟩ Maxwell's two curl equations then become short updates: the change of E over one step
follows from the curl of H around its edge, and the change of H from the curl of E around its face. ⟨251⟩ E and H are
updated in turn, half a step apart ("leapfrog"), and each value needs only its neighbours, so no system of equations is
solved and every cell costs the same work [WikiFDTD] [OpenEMSDocs]. ⟨252⟩ The tool stores the magnetic field as η0·H,
so both fields are numbers of the same size; the laminate's loss enters each E update through two coefficients per
edge, and copper sets both to zero. ⟨253⟩

The time step has an upper limit: above it some short waves on the grid grow from step to step and the run blows up
[WikiFDTD]. ⟨254⟩ This is the Courant–Friedrichs–Lewy condition [CFL1928]; for Yee's grid it follows from the scheme's
own dispersion relation, Δt ≤ 1/(c0·√(1/Δx² + 1/Δy² + 1/Δz²)) with the smallest cells, and the tool takes 0.95 of it.
⟨255⟩ So the smallest cell sets the step for the whole grid [OpenEMSDocs]: the default via's smallest cells are
0.050, 0.034 and 0.020 mm, so a step is 52.4 fs. ⟨256⟩ The run lasts ten of the pulse's σ plus three round trips of
the longest path from port to port, 400.9 ps or 7645 steps for the default via; it stops sooner once the energy in the
grid has fallen 50 dB under its peak. ⟨257⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `fdtd-update` | `\tilde{\mathbf H} \leftarrow \tilde{\mathbf H} - \tfrac{c_0\Delta t}{\Delta}\,\nabla\times\mathbf E,\quad \mathbf E \leftarrow C_A\,\mathbf E + C_B\,\tfrac{c_0\Delta t}{\Delta}\,\nabla\times\tilde{\mathbf H}` | none (a rule) |
| `fdtd-courant` | `\Delta t = \frac{S_c}{c_0\sqrt{\Delta x^{-2} + \Delta y^{-2} + \Delta z^{-2}}},\ S_c = 0.95` | the mesh's smallest cells [0.0500, 0.0344, 0.0204 mm], `est.dt` [52.444 fs] |
| `fdtd-steps` | `N_t = \left\lceil \frac{10\,\sigma + 3\,\tau_\mathrm{rt}}{\Delta t} \right\rceil` | `est.T` [400.93 ps], `est.tauRt` [88.237 ps], `est.steps` [7645] |

**Figures.** 1. One Yee cell: E arrows on three edges, H arrows on three faces, half a cell apart (static SVG, both
themes). 2. A strip of cells in time: E at whole steps and H at half steps, each computed from the other (static SVG).

### The mesh and round barrels (`fw-mesh`)

The grid is graded: its lines lie on every copper edge and layer surface, and between them a cell is at most 1.3 times
its neighbour, up to a largest cell. ⟨258⟩ That largest cell is a fifteenth of the wavelength in the highest εr at
0.877/tr, where the edge's spectrum is 20 dB down: 0.374 mm for the default stackup (εr 4.55) at 35 ps. ⟨259⟩ The
grid itself slows short waves a little, more the coarser the cells [WikiFDTD]: along an axis at fifteen cells per
wavelength, by at most 0.7 %. ⟨260⟩ A trace gets at least four cells across, a pair's gap three, a dielectric between
a trace and its plane four; no cell is under 20 µm, so the solder mask and thinner layers are averaged into the cells
around them. ⟨261⟩

A round barrel on a square grid becomes a staircase [OpenEMSDocs], and that error falls only slowly as cells shrink:
in the tool's first test a staircased barrel was still 4 % off in impedance at 32 cells across the drill. ⟨262⟩ The
tool uses conformal cells instead: where a copper circle cuts a face of the grid, each E edge counts only with the part
of its length outside the copper, so the update sees the true circle [DeyMittra1997]. ⟨263⟩ With six cells across the
drill the barrel's impedance is then within 0.5 % [0.050 mm cells across the 0.3 mm drill], and the cut faces leave the
time step as it was. ⟨264⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `fdtd-cell` | `\Delta_\mathrm{max} = \frac{c_0}{15\,f_\mathrm{hi}\sqrt{\varepsilon_{r,\mathrm{max}}}},\ f_\mathrm{hi} = \frac{0.877}{t_r}` | `tr` [35 ps], the model's `erMax` [4.55], the mesh's `hmax` [0.37393 mm] |
| `fdtd-dispersion` | `\frac{v}{c} = \frac{\sin(k\Delta/2)}{k\Delta/2} \approx 1 - \frac{(k\Delta)^2}{24}` | none (at 15 cells per wavelength: 0.99271) |

**Figures.** 3. A barrel's circle over a few grid cells: staircased (whole cells copper) beside conformal (each cut
edge shortened to its part outside), static SVG.

### The boundary (`fw-edges`)

The grid has to end, but the board should behave as if it went on: a wave that reaches the side of the grid must leave
and not come back. ⟨265⟩ The tool closes every open side with a convolutional perfectly matched layer (CPML), eight
cells in which the fields are damped gradually enough that a wave enters it with almost no reflection [WikiFDTD] [RodenGedney2000]. ⟨266⟩ It also absorbs the near field that decays without travelling, which older absorbing layers
reflect [WikiFDTD]. ⟨267⟩ In the tool's test it reflected −92.8 dB in front of a face, −84.7 dB at an edge and
−74.6 dB at a corner. ⟨268⟩ The board's layers and planes run into it, so the wave between the planes is absorbed: the
run sees an endless board, as the via model does, without the resonances of a real board's edges (#via-return). ⟨269⟩

### Ports, pulse and results (`fw-ports`)

Each feed ends in a lumped port: the edges from the trace's end down to its plane carry a voltage source with a
resistor equal to the feed's Z0 from the 2D solver [OpenEMSDocs] [PiketMay1994]. ⟨270⟩ The resistor matches the line,
so the wave that comes back to the port is absorbed and the run settles soon. ⟨271⟩ The source is a Gaussian pulse of
1 V whose spectrum is 60 dB down at f_run = 1.52/tr, so one run serves every edge from tr up [43.4 GHz, σ 13.6 ps,
the peak at 5σ = 68.1 ps]. ⟨272⟩ A short pulse is the point: one run in time gives the response at every frequency in
its spectrum [WikiFDTD] [OpenEMSDocs]. ⟨273⟩

Two planes on each feed record, at every step, the voltage between trace and plane and the current around the trace;
from them the wave going in is a = (v + Z·i)/2 and the wave coming out b = (v − Z·i)/2 [OpenEMSDocs]. ⟨274⟩ After the
run the Fourier transform of these records gives a and b at any frequency, and with one run per port S = B·A⁻¹, up to
0.816·f_run, where the pulse is 40 dB down [35.4 GHz]. ⟨275⟩ The feed's own propagation, fitted between its two
planes, is taken out, so S belongs to the via's reference plane. ⟨276⟩ The TDR and TDT are made from that S with the
same Gaussian edge as the via model's, so the two curves lie on one plot without a conversion (#via-tdr). ⟨277⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `fdtd-pulse` | `f_\mathrm{run} = \frac{1.52}{t_r},\ \sigma = \frac{\sqrt{2\ln 1000}}{2\pi f_\mathrm{run}},\ f_S = 0.816\,f_\mathrm{run}` | `pulseOf(tr)` `fRun` [43.429 GHz], `sigma` [13.622 ps], `t0` [68.109 ps]; `res.nport.f` last [35.438 GHz] |
| `fdtd-waves` | `a = \tfrac{1}{2}(v + Z\,i),\quad b = \tfrac{1}{2}(v - Z\,i)` | `res.records.ports[i].z0` (the feed's 2D Z0) |
| `fdtd-s` | `S(f) = B(f)\,A(f)^{-1},\ A_{ij}(f) = \sum_n a_{i,j}[n]\,e^{-j2\pi f n\Delta t}\,\Delta t` | `res.nport` |

### What a run costs (`fw-cost`)

The work is the number of cells times the number of steps: the default via is 712 320 cells × 7645 steps for each of
its two ports, about 10.9 billion cell updates. ⟨278⟩ Cells half the size would make eight times the cells and,
through the Courant limit, twice the steps: sixteen times the work. ⟨279⟩ Every cell does the same small update, which
suits a graphics processor [WikiFDTD]: the tool runs on WebGPU in 32-bit numbers and falls back to a worker on the
CPU. ⟨280⟩ On the laptop the tool was built on, the default via's two runs took 1.15 s on the GPU and 340 s on the CPU,
295 times longer; the pair (four ports) took 4.2 s and 10.1 min. ⟨281⟩ 32-bit numbers are enough: their port
signals differ from 64-bit ones by about 10⁻⁵ of the peak, far under the mesh's own error. ⟨282⟩ Before a run the
estimate shows cells, memory, steps and time; the run first times a few dozen steps on its own grid, warns over
5 minutes and refuses over 60 minutes or more memory than the device allows. ⟨283⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `fdtd-cost` | `t_\mathrm{run} = \frac{1.5\,N_\mathrm{cells}\,N_t\,N_\mathrm{ports}}{R}` | `est.cells` [712 320], `est.steps` [7645], ports [2], `est.rate` (WebGPU table 6·10⁹/s: 2.72 s; CPU 3·10⁷/s: 545 s) |

### Reading the waves (`fw-read`)

The player in the Waves section (#waves) shows the electric field on a slice through the run, about 300 frames over the run [294 frames, one every
26 steps]. ⟨284⟩ The values are in V/m for the 1 V pulse behind the port's resistor. ⟨285⟩ |E| is the field's
strength, never negative; Ez, Ex and Ey are one direction each with its sign, one colour for each way. ⟨286⟩ A signed
component shows polarity: a reflection from a lower impedance comes back with the opposite sign (#via-tdr). ⟨287⟩
Each slice keeps one colour scale for the whole run, so a bright frame is a strong field and never a weak one
stretched. ⟨288⟩ The scale's top is the 99.9th percentile of the slice's values over all frames, because a few cells
at the copper's edges, where the charge crowds (#field-solver), hold far stronger fields than the rest; those are
drawn in the top colour. ⟨289⟩

On a via, the side view cuts through the barrel along its feeds: the pulse comes in under the entry feed, turns down
the barrel between the planes and leaves under the exit feed, and a part of it comes back wherever the impedance
changes. ⟨290⟩ The view from above between two planes shows rings spreading from the antipads: the parallel-plate
wave the barrel's current launches into the cavity (#via-return). ⟨291⟩ Return vias joined to both planes carry the
return current beside the barrel; the cavity wave that gets past them runs out to the boundary and is lost to the
signal. ⟨292⟩ At 20 GHz the default via passes −2.61 dB and reflects −4.8 dB (openEMS: −2.70 and −4.8 dB), so about
12 % of the power comes out at neither port: the laminate takes some and the rest leaves the via as waves. ⟨293⟩ That is where the via model's cavity limit comes
from: 20.8 GHz for the default via (#via-limits). ⟨294⟩ The views from above at each feed, halfway down to its plane,
show the field between each trace and its plane, as the Trace section's field map does. ⟨295⟩

### A pair's drives (`fw-pair`)

For a pair the run drives entry A and entry B in turn, and the player adds their frames: differential is A at +1 V
and B at −1 V, common both at +1 V, so a drive costs no extra run. ⟨296⟩ Adding is exact because Maxwell's equations
and the grid's updates are linear: the field of two sources is the sum of their fields. ⟨297⟩ In the differential
drive the two barrels carry opposite currents, so their fields cancel at a distance and stay around the pair; from
above, Ez has opposite signs at the two barrels. ⟨298⟩ In the common drive the fields add and the wave spreads into
the cavity towards the return vias, as from one via. ⟨299⟩ So a pair driven differentially launches almost no cavity
wave, and the via model's limit for the LVDS pair stays near 23 GHz (#via-limits). ⟨300⟩ The side view still goes
through barrel A along its feeds, not through both barrels. ⟨301⟩ The Drive choice in the Waves section (#waves) shows
each. ⟨301⟩

### The 3D view (`fw-3d`)

The 3D view in the Waves section (#waves) puts the same frames on planes inside the run's own structure, played on the player's clock, so both
views always show one moment. ⟨302⟩ Cutting the structure along the side plane shows that plane whole with the
others behind it. ⟨303⟩ On a trace the view from above shows the wave travelling along it and the view across its
quasi-TEM cross-section, the Trace section's field map in motion (#transmission-lines). ⟨304⟩

### How it was checked and where it stops (`fw-checked`)

The engine was checked against openEMS, a separate open-source FDTD solver [OpenEMSDocs], run on the same structures
while the tool was built. ⟨305⟩ openEMS meshes the copper as a staircase; this tool uses conformal cells. ⟨306⟩ 43
limits were set from that comparison and all held, the worst at 0.82 of its limit: the TDR within 2.5 Ω at 35 ps,
|ΔS| within 0.10 up to 10 GHz and 0.15 up to 20 GHz, a section's impedance and delay within 12 %, a stub's notch
within 8 %. ⟨307⟩ On the default via the TDR peaks at 62.4 Ω (openEMS 61.9 Ω), its stubbed twin's notch lies at
22.9 GHz (openEMS 21.6 GHz, +6.0 %), and the LVDS pair's line reads Zdiff 102.4 Ω (openEMS 103.4, the 2D solver
103.4 Ω). ⟨308⟩ Most of what is left is the mesh: with staircased barrels like openEMS's, the difference in S up to
20 GHz falls from 0.092 to 0.029 and the notch's from +6.0 % to +1.9 %. ⟨309⟩ Above 20 GHz nothing is held to a
limit: the via resonates and radiates there, and the staircase alone moves the result a lot. ⟨310⟩

The copper is a perfect conductor and the laminate's loss is fitted at one frequency, so copper loss and the change
of loss with frequency are left out. ⟨311⟩ A run serves edges from its own rise time up; a faster edge needs a new run
with finer cells. ⟨312⟩ The player does not show the magnetic field or the currents in the copper, the waves of the
exit ports' drives, or the copper on the 3D planes yet. ⟨313⟩

### Short lines that link here (for M7.2d)

The Waves section's lines (theory-lines.md "Waves", "the player", "the 3D view") and the anchor each should link to:

| Line id | → |
|---|---|
| waves-kind | `fw-why` |
| waves-tr | `fw-mesh` |
| waves-backend, waves-estimate | `fw-cost` |
| waves-progress | `fw-yee` |
| waves-plots, waves-notes | `fw-ports` |
| waves-checked | `fw-checked` |
| waves-player, waves-view, waves-comp, waves-scale | `fw-read` |
| waves-mode | `fw-pair` |
| waves-3d, waves-3d-planes, waves-3d-cut | `fw-3d` |
| via-next (the Via section's "Run it in Waves" line) | `fw-why` |
