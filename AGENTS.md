# AGENTS.md – instructions for coding agents

Status: first version (Phase 2). Phase 6 completes the repository map, the commands and the checklists.

## 1. Purpose

"Úkoly" (repository `mytasker`) is a task manager for a small team. The app is 1 HTML file in a shared OneDrive folder. It runs in Edge or Chrome over `file://`. The data is a log of signed, immutable JSON op files. See `docs/architecture.md` and `docs/data-model.md`.

## 2. Constraints (non-negotiable)

1. **No server.** No backend, sync service, push or email service, cloud function, Microsoft Graph or app registration.
2. **1 self-contained `index.html`**, opened over `file://`. All JS and CSS are inline.
3. **No network requests at runtime.** The CSP has `default-src 'none'` and `connect-src 'none'`. Do not add CDNs, fonts or `fetch` calls.
4. **Desktop Edge or Chrome 137 or later.** File System Access API, WebCrypto Ed25519.
5. **No real user data in git.** Tests, docs, fixtures and screenshots use synthetic data only.
6. Runtime dependencies: Preact and `oplog-core` only. A new runtime dependency needs the owner's approval.
7. The UI is in Czech. All strings are in `src/ui/i18n.ts`.

## 3. Invariants

- Nobody changes or deletes an op file. A change is always a new op.
- The replay is deterministic. The same set of ops gives the same state, in any input order.
- `authorize(op, stateAtThatPoint)` is the only gate. The UI calls the same function. Never rely on a UI-only check.
- Safe rendering only: no `dangerouslySetInnerHTML`, no inline HTML or SVG attachments, links only `http:`, `https:`, `mailto:`.
- Generic code (canonical JSON, crypto, HLC, verify, replay, engine, storage) belongs in `oplog-core`, not in this repository.

## 4. Repository map

| Path | Content |
|---|---|
| `src/domain/` | Op catalogue, permission matrix, `authorize`, status state machine, search, notifications. No DOM. |
| `src/app/` | Browser services: session, key file, encrypted cache, files. |
| `src/ui/` | Preact UI, `i18n.ts`, CSS. |
| `test/` | `unit`, `property`, `simulation`, `e2e`, `perf`, `fixtures` (synthetic only). |
| `docs/` | Architecture, data model, wireframes, review checklist, ADRs, open questions. |
| `scripts/` | `check-build.mjs` (build check), `release.mjs` (release package). |
| `release/` | `create-folders.sh` (empty folder skeleton). `release/app/` is generated and git-ignored. |
| `.claude/agents/mt-reviewer.md` | Claude Code subagent for the expert review (uses `docs/review-checklist.md`). |
| `Makefile` | Wrapper targets. `make help` lists them. |

## 5. Commands

`make help` lists all targets. `make check` runs the checks before each commit.

```sh
npm install            # or make install (npm ci)
npm test               # unit + property + simulation
npm run typecheck
npm run build          # dist/index.html + build check (needs Chromium, SKIP_BROWSER=1 skips it)
npm run simulate
npm run test:e2e       # build + browser tests (CHROMIUM=/path/to/chromium)
npm run release        # release/app/: index.html, LICENSE, VERSION, SHA256SUMS
```

Not available yet: `npm run simulate` and `npm run perf` need the tests of Phase 3, and `npm run test:e2e` needs the tests of Phase 4. Until then, these commands fail with "No test files found". `make demo` prints a URL, but the demo mode comes in Phase 4.

## 6. Working rules

1. **Stop and ask** the owner before you change the op format, the permission matrix or the status state machine. Record the question and the answer in `docs/open-questions.md`.
2. **Temporary files** (probes, screenshots, test folders) go to a temporary directory outside the repository.
3. **Language.** Docs, comments and commit messages: English in Simplified Technical English style. UI text: Czech, in `src/ui/i18n.ts`. The user guide `docs/user-guide.md`: Czech.

## 7. Git workflow

1. The default branch is `master`.
2. No remote exists yet. Until the owner creates one, commit on `master`. Do not push. The owner will tell you when this rule changes (then: feature branches and pull requests, as in `system-vzdelavani`).
3. **Expert review before every commit.** This rule applies to all changes, also to small changes and to changes of documentation only.
   1. Make sure that these checks pass: `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` for UI changes.
   2. Give an independent expert reviewer the intent, the changed files, the diff and the checks that passed. The reviewer applies `docs/review-checklist.md`. The reviewer must be a separate agent (a subagent or a new session), not the author. It must use a model at least as strong as the author's. In Claude Code, use the subagent `mt-reviewer`.
   3. Fix all valid findings. Run the checks again after the fixes. If a fix changes more than the finding asks for, review again.
   4. If you do not fix a finding, tell the owner why, and write it in the commit message.
4. Write commit messages in Simplified Technical English. Add a "Review:" paragraph: what the reviewer found and what you did with each finding.

## 8. Definition of done

- `npm run typecheck`, `npm test` (includes the property test and the simulation) and `npm run build` pass.
- `npm run test:e2e` passes for UI changes.
- Docs are updated: `docs/*.md`, an ADR for a significant decision, `docs/open-questions.md`, `docs/user-guide.md` for user-visible changes.
- No real user data in `git status`.
- The expert review (§7, step 3) ran before each commit.
