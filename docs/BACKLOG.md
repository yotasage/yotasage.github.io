# Backlog

Wanted, not scheduled, for every tool on the site. Ids `BL<n>`, never reused (**next free: BL206**). When a row is
scheduled it moves into the tool's plan (for the PCB viewer: [pcb-viewer/plan.md](pcb-viewer/plan.md); for the resistor
lookup: [resistor/plan.md](resistor/plan.md); for the Smith chart: [smith-chart/plan.md](smith-chart/plan.md); for the
EM simulation: [em-sim/plan.md](em-sim/plan.md); for the Python playground: [python/plan.md](python/plan.md)) and the move is noted in [backlog/done.md](backlog/done.md); when it is
done the row is removed and recorded there too.

## Rules

- Every new item takes the next free `BL<n>` ID above and bumps the **next free** counter in this index.
- Keep each sub-file under 40 kB; split a category further (as `em-sim.md` / `em-sim-2.md`) before it approaches the cap.
- When an item is completed or merged, remove its table row from its category file and record the closure in [backlog/done.md](backlog/done.md).

## Categories

| File | Scope | Open rows |
|---|---|---:|
| [backlog/em-sim.md](backlog/em-sim.md) | EM simulation (BL135–BL201) | 52 |
| [backlog/em-sim-2.md](backlog/em-sim-2.md) | EM simulation (BL69–BL134, incl. phase 2) | 56 |
| [backlog/pcb-viewer.md](backlog/pcb-viewer.md) | PCB viewer | 29 |
| [backlog/smith-chart.md](backlog/smith-chart.md) | Smith chart | 20 |
| [backlog/other.md](backlog/other.md) | Site, Resistor lookup, QR code reader/generator, other tools | 10 |
| [backlog/python.md](backlog/python.md) | Python playground | 2 |
| [backlog/done.md](backlog/done.md) | Done, merged, and removed history | — |

Total open items: **169**.
