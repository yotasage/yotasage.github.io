# Agent Workflow Rule

1. **Read `CLAUDE.md` first** at the start of every session for hard constraints (static export, client-side only, self-hosted assets, licence rules, commit style, and session reminders such as "Waiting on").
2. **Read `docs/agent-workflow.md` before starting multi-step work.** Whenever a task involves a multi-step plan, a new tool, a phase/milestone, or more than a quick single-file change, read `docs/agent-workflow.md` *before* writing code or running edits.
3. **Key workflow requirements from `docs/agent-workflow.md`:**
   - Keep the main session small as coordinator (plan, brief, verify); do not implement multi-step plans directly in the main session.
   - Run **one step subagent at a time** (never parallel agents).
   - Size each step under ~200k tokens and write a tight brief naming only the files to read/change, scope, out-of-scope, verification bar, commit rules, and `<300`-word report.
   - Set up a watchdog schedule (`7,37 * * * *`) while step agents run, and cancel it when the work finishes.
   - Verify clean `git status` and zero leftover background processes (`node`, dev servers, headless browsers) after every step.
