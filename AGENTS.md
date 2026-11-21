# AGENTS.md

Read [CLAUDE.md](CLAUDE.md) at the start of every session — it is the single source of truth for project constraints, architecture, build/verification commands, and conventions.

**Mandatory before multi-step work:** For any feature, phase, refactor, or multi-step plan work (anything beyond a small single-file fix), **read [docs/agent-workflow.md](docs/agent-workflow.md) before making any code edits** and follow it strictly (main session as coordinator, one step subagent at a time, targeted briefs, watchdog schedule, explicit per-step commits, no leftover processes).

*(If `next dev` modifies this file, restore it with `git checkout -- AGENTS.md`.)*
