@AGENTS.md

- Run `make check` (typecheck, tests with the simulation, build check) before you report that work is done.
- Stop and ask the owner before you change the op format, the permission matrix or the status state machine.
- Run the expert review of `AGENTS.md` §7 with the Claude Code subagent `mt-reviewer` (`.claude/agents/mt-reviewer.md`).
- Do not give a `model` or an `effort` override when you start the reviewer. Do not set a default subagent model (setting or `CLAUDE_CODE_SUBAGENT_MODEL`) for this project: it replaces the model of every subagent, also of the reviewer.
