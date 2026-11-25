# Backlog — Python playground

Open backlog items for the Python playground (`/python/main`, plan in [../python/plan.md](../python/plan.md)) (2 rows). Index and next free ID: [../BACKLOG.md](../BACKLOG.md).

| id | tool | what | why / trigger |
|---|---|---|---|
| BL205 | Python playground | A timeout around `pyodide.http.pyfetch` in `yotasage_rt`, or a line in the limits text: in WebKit a fetch the worker CSP blocks never settles, so `await pyfetch(...)` to a blocked host hangs the console until Restart. `micropip` is already guarded (P5a refuses blocked hosts and empties the index in Off before fetching) | 2026-11-25: found by the P5 research (notes-P5.md finding 3, §13 question 7); not part of P5. Trigger: the owner meets the hang, or P12 polish |
| BL204 | Python playground | PEP 723 `# /// script` blocks: the page reads `dependencies` from the file it is about to run (`lib/python/pep723.ts`), lists names that are neither bundled nor installed, shows W6 and sends `pkg.install` with reason `script-header` before `run`; in Off it lists what it skipped and runs anyway (`requires-python` shown, not enforced) | 2026-11-25: recommended by notes-P5.md §3.1, deferred by the coordinator (D24); the `script-header` install reason is already in the protocol. Trigger: after P6, when the owner wants scripts to declare their packages |
