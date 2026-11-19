# Expert review checklist

An independent expert reviewer applies this checklist to **every change before each commit** (`AGENTS.md` §7). Any coding agent can use it. In Claude Code, the subagent `mt-reviewer` (`.claude/agents/mt-reviewer.md`) runs it.

## Input to the reviewer

The author gives the reviewer:

1. The **intent**: what the change must do, and why.
2. The **list of changed files**.
3. The **diff** (`git diff HEAD`, or the full content of new files for the first commit).
4. The **checks that passed** (typecheck, tests, simulation, build check, e2e).

The reviewer reads the surrounding code for context, and the design docs of the area that the change touches:

| Area | Read |
|---|---|
| Ops, replay, permissions, status machine, revert, conflicts | `docs/data-model.md`, `docs/architecture.md` |
| Keys, cache, CSP, folder access, attachments, Markdown | `docs/security-model.md`, ADR 0006, ADR 0011 |
| Generic op-log code | `../oplog-core` and its docs, ADR 0001 |
| UI | `docs/ui-wireframes.md`, `src/ui/i18n.ts`, the CSS |
| Design decisions | `docs/decisions/`, `docs/open-questions.md` |

## Checklist (in order of priority)

### 1. Invariants (`AGENTS.md` §3): any break is a blocking finding

- No code modifies or deletes an existing op file in the shared folder. `Storage.writeNew()` still fails for an existing file. The only permitted delete is the attachment blob after `PurgeBlob`.
- Replay is deterministic. No `Date.now()`, randomness, locale or iteration-order dependence in `effects()`, `authorize()`, the status machine or replay. Sorts have a total order.
- `authorize()` is the only permission gate. The UI uses `can()` only to hide controls.
- The permission matrix, the status state machine and the op format change only with the owner's approval (recorded in `docs/open-questions.md`).
- No network access: no `fetch`, no remote URL, no CDN, no change that weakens the CSP.
- Generic op-log code goes into `oplog-core`, not into a copy in this repository.

### 2. Correctness and bugs

Wrong logic, unhandled `null` or `undefined`, off-by-one errors, wrong date arithmetic (time zone Europe/Prague, daylight saving time, optional due date), stale Preact state, missing `await`, unhandled promise rejections, races between scans and writes, incremental replay that differs from a full replay, concurrent status changes that do not converge.

### 3. Security

- No real user data in code, tests, fixtures, docs, logs or commit messages. Test data is synthetic.
- Keys stay non-extractable after unlock. Nothing unencrypted goes to IndexedDB, except what ADR 0006 permits in `localStorage` (view settings).
- No `dangerouslySetInnerHTML`, no `eval`, no HTML built from strings. The Markdown renderer makes Preact nodes.
- Links: only `http:`, `https:`, `mailto:`, with `rel="noopener noreferrer"`.
- Attachments: only raster images inline (type from magic bytes). Never HTML, SVG, XML or PDF inline. The blob hash is checked on read.
- Paths built from data cannot escape their folder.

### 4. UI quality

- Simple, clean and readable. The design follows `docs/ui-wireframes.md`.
- Every visible string is in `src/ui/i18n.ts`. The Czech text is correct and natural: correct plurals (`Intl.PluralRules`), dates as `19. 11. 2026 14:30`.
- Status is clear without color (icon and label). WCAG AA contrast. Full keyboard use with a visible focus.
- Layout: no content leaks out of its card, table or panel at 1000, 1400 and 1920 px width, also with long titles and many tags.
- Controls that the user cannot use are hidden or disabled.

### 5. Tests

- New or changed behavior has tests. Logic in `src/domain`: unit tests. UI behavior: an e2e test in `test/e2e/`.
- A change of the status machine or the permission matrix updates the full matrix tests.
- A test for a bug must fail without the fix. The author checks this 1 time and reports it.
- Tests use synthetic data only, and they test the behavior, not the implementation.
- A test that the change makes weaker or removes is a finding.

### 6. Performance

No new O(n²) work in replay, scans, search or a single write. The UI does not recompute expensive values on every render for no reason. Size reference: 5 000 tasks, 100 000 ops.

### 7. Docs and style

- Docs that the change makes wrong are updated (`README.md`, `docs/`, `AGENTS.md`, the Czech user guide for user-visible changes).
- English text follows Simplified Technical English.
- Code reads like the code around it. TypeScript strict, no `any` without a reason.

## Output

Report each problem with these parts:

- a short description
- the file and the line
- the reason: why it is wrong and what it breaks
- the severity: **blocking**, **should fix** or **minor**

Sort the problems by severity. Say clearly which findings are certain and which are suspicions to check.

**"No problems found" is an acceptable result. Never invent findings.** If you could not check something, say so.

The reviewer does not change files in the repository (the build output in `dist/` is permitted) and does not commit.
