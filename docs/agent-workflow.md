# Working with Claude agents

How to run large work, such as a new tool built in steps, with Claude Code so it uses as little of the Claude usage
limit as possible and survives usage limits and lost connections. The rules come from measuring the PCB viewer build
(2026-11-08/09, branch `pcb-viewer`). For the PCB viewer's own steps, see [pcb-viewer/plan.md](pcb-viewer/plan.md).

## What the PCB viewer cost, and why

- **The work:** 9 steps (S1–S9) and a font licence fix, each done by its own background agent, plus the main session
  that planned, briefed and checked them. About 26,000 lines of code, 2,448 calls to the model.
- **Where the usage went** (weighted by API price ratios: cached context re-read at 0.1×, newly cached context at 1.25×,
  output at 5×):
  - about 80%: re-reading the conversation's context on every call (1.18 billion tokens);
  - about 12%: output (code and reasoning);
  - about 8%: writing context to the cache.
- **Who used it:** the step agents. The main session, including the watchdog, was about 4%.
- **The cause:** every step agent's context grew to 600–925k tokens over 200–350 calls and was never compacted.
  A call costs about as much as the context it re-reads, so a call late in a step cost 10–20 times one at the start.

| What made the context large | Seen in the PCB viewer |
| --- | --- |
| Briefs said "read first, fully": the plan and the code of all earlier steps | Agents made 30–143 calls before their first edit to the repo, and were at 270–570k tokens by then |
| Format research was done by the agent that then wrote the code | S5 (Altium) spent 120 calls reading `altiumts`, dumping records and fitting PDF prints before writing code; every later call carried all of it |
| The plan grew with every step's notes | The plan reached 141k characters and was read 2–5 times per agent (it is now split into `docs/pcb-viewer/`) |
| No "good enough" bar for verification | About 40% of calls were checks: pixel differences against Gerbers and `kicad-cli`, text fitted to 1–3%, round trips through KiCad |
| Briefs said "do not spawn further agents" | Research, code and checks all piled up in one context |
| Many small calls | 100–280 shell calls and up to about 100 edits per agent, each a round trip at 400k+ tokens |

Screenshots were not a big cost (about 3% of the growth), and neither were resuming after limits, nor the watchdog.

**What worked:** one agent per step with one commit each, checked by the main session; the main session kept small;
a stopped agent resumed with `SendMessage` instead of being started again; a test harness reused across steps; Haiku
for a web lookup.

A rough estimate: had each agent's context averaged about 200k instead of about 480k tokens, the build would have
cost about 45% less, before counting savings from fewer checks.

## Rules for the next large piece of work

### Plan

- **Build the smallest useful version first** and let the owner use it before planning the rest in detail. Extra
  formats and exports (for the PCB viewer: EAGLE, PDF/DXF and KiCad export, about 40% of the cost) are later steps
  the owner confirms.
- **Size steps by context, not by feature.** One agent should finish under about 200k tokens of context: roughly one
  format or one feature, 1,000–3,000 lines of new code.
- **Keep the plan short.** It is the contract: ground rules, the shared model, the scope of each step, the status.
  Notes a step leaves for later steps go in a file of their own (for example `docs/<tool>/notes-S3.md`), read only by
  the steps that need them.
- **One agent at a time.** Do not run two agents side by side, not even a research agent beside a code agent: the
  owner often has other sessions open, and parallel agents use up the 5-hour limit too fast (2026-11-11, resistor
  lookup). Pause the second one and resume it with `SendMessage` when the first is done.
- **Split a step into engine and page** when it has both: an agent that writes framework-free code checked by tests
  alone (no dev server, no screenshots) stays smaller than one that also builds and looks at the page. In the
  resistor lookup the page steps still reached 215–285k tokens against briefs asking for 150–180k, so give a page
  step less than seems to fit.
- **Keep a module map:** one line per file with what it does and its main exports, in the plan or CLAUDE.md, so an
  agent finds its way without reading the code.

### Split heavy steps into research, code and check

1. **Research agent:** reads the format, the samples, the library source and the references, and writes a notes
   file (facts, decisions, open questions; aim for under about 10k tokens). Web or licence lookups can run on Haiku.
2. **Implementation agent:** starts fresh from the brief, the notes file and the files it changes.
3. **Verification:** the main session or a fresh agent runs the harness and reports differences; fixes go to a small
   fix agent.

Agents may start a sub-agent for a contained lookup when that keeps their own context small.

### Briefs

A brief names:

- the goal, the scope and what is out of scope;
- the files to read and to change, and the plan sections by name, never "read everything fully". Large files are
  read in parts (`offset`/`limit`, or `grep` first);
- **the verification bar:** what to compare with, on which sample, what difference is good enough and when to
  stop. Default for a viewer: it looks right at a glance and passes one reference comparison per format; do not
  chase differences under about 1%;
- how to check with few calls: one harness command that runs the type-check and the comparisons and prints a short
  summary; shell commands chained; a new file written whole rather than through many small edits;
- that screenshots are downscaled (about 1,000 px wide at most) and taken only when needed;
- the commit rules (CLAUDE.md, explicit paths, no push) and a report of under 300 words.

### Test harness

Keep the harness for a tool in the repo, for example `scripts/harness/<tool>/` with a `package.json` of its own (not
the site's) and `node_modules` ignored, so it survives the session and works on other machines. The PCB viewer's
harness was in a session's scratch folder; its contents are described in the plan's "Verification" section.

## Limits, pauses and lost connections

- **Watchdog:** a session that runs background agents sets one up when it starts, without being asked. It is a
  `CronCreate` job every 30 minutes at minutes away from :00 and :30 (for example `7,37 * * * *`). Run `CronList`
  first so the job is not created twice. Each run:
  - checks the agents with `ListAgents` and the task notifications;
  - resumes with `SendMessage` any agent that a usage limit, an API error or a lost connection stopped and that is not
    running again, telling it to continue where it stopped, check `git status`, reuse or stop a dev server left on port
    3020, delete any `AGENTS.md` that `next dev` wrote, and finish its original brief;
  - does not resume agents that finished normally or that the owner stopped, and does not start new agents;
  - tells the owner in one line which agent it resumed and why, or ends with one short line if nothing needed it.

  Cron jobs exist only while the session is open and expire after 7 days, so a new session sets the job up again.
  A usage limit also stops the watchdog, so a stopped agent is resumed at the first check after the limit resets.
- **Resume, don't restart:** `SendMessage` to the stopped agent keeps its work and its context; a new agent would
  have to read everything again.
- **Pausing:** stop the agent and its dev server, switch the watchdog off, and set a one-time `CronCreate` job that
  resumes the agent and switches the watchdog on again.

## Measuring a session

Claude Code keeps each session as JSON lines in `~/.claude/projects/<project folder>/<session id>.jsonl`, and its
agents in `<session id>/subagents/agent-*.jsonl`. Every assistant line has `message.usage` with `input_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens` (lines with the same `message.id` are one
call; count them once). The context of a call is the sum of the three input figures; summing them over the calls and
listing the largest tool results shows where the usage went.
