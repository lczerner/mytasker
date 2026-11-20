# AGENTS.md – instructions for coding agents

Status: complete for version 0.1 (Phase 6).

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
| `src/domain/` | The `Domain` for `oplog-core` (`domain.ts`), op catalogue (`catalog.ts`), permission matrix (`permissions.ts`), status state machine (`status.ts`), state helpers, fractional index, text rules, task views, search, notifications. No DOM. |
| `../oplog-core` | Shared core (separate repository): canonical JSON, crypto, HLC, verify, replay, engine, storage adapters. |
| `src/app/` | Browser services: session (folder handle, key file, encrypted cache), files and attachments, IndexedDB, demo data, performance data (`perfdata.ts`). |
| `src/ui/` | Preact UI: start screens (`Gate.tsx`), shell (`App.tsx`), task list, task panel, dialogs, admin screens (`admin.tsx`), audit, revert and integrity (`audit.tsx`), notifications (`Notifications.tsx`), built-in guides (`Help.tsx`, parser `docs.ts`), information bar (`Footer.tsx`), safe Markdown (`markdown.ts`), `i18n.ts` (all texts), `styles.css`. |
| `test/` | `unit` (state machine and `authorize` matrices, domain rules), `property` (convergence), `simulation` (multi-user on disk, attacks), `e2e`, `perf`, `fixtures` (synthetic only). `helpers.ts` makes a synthetic team. |
| `docs/` | User guide and admin guide (Czech, built into the app), operations, architecture, data model, security model, wireframes, review checklist, ADRs, open questions. |
| `scripts/` | `check-build.mjs` (build check, also the third-party notices), `release.mjs` (release package), `commit.mjs` (the commit of a build), `screenshots.mjs` (guide images). |
| `release/` | `create-folders.sh` (empty folder skeleton). `release/app/` is generated and git-ignored. |
| `.claude/agents/mt-reviewer.md` | Claude Code subagent for the expert review (uses `docs/review-checklist.md`). |
| `Makefile` | Wrapper targets. `make help` lists them. |
| `README.md`, `LICENSE`, `THIRD-PARTY-NOTICES.md` | Overview, license, licenses of the bundled packages. A new runtime dependency needs a section in `THIRD-PARTY-NOTICES.md` (the build check fails without it). |

## 5. Commands

`make help` lists all targets. `make check` runs the checks before each commit.

```sh
npm install            # or make install (npm ci)
npm test               # unit + property + simulation
npm run typecheck
npm run build          # dist/index.html + build check (needs Chromium, SKIP_BROWSER=1 skips it)
npm run simulate
npm run test:e2e       # build + browser tests (CHROMIUM=/path/to/chromium)
npm run release        # release/app/: index.html, LICENSE, THIRD-PARTY-NOTICES.md, VERSION, SHA256SUMS
```

`npm run test:e2e` runs the demo flows, the real flow with OPFS (new installation, enrollment, approval) and the layout test. `make demo` builds and prints the URL of the demo mode (`?demo`, `?demo=petr`, `?demo=large`). `npm run perf` measures 5 000 tasks with about 100 000 ops (`docs/performance.md`); `dist/index.html?demo=perf` measures the UI. `node scripts/screenshots.mjs` (after a build) makes the guide images `docs/img/*.jpg` from the demo. `SIM_SEED` and `SIM_ROUNDS` change the simulation run.

## 5a. Checklist: add a new op type or status

1. Ask the owner first if the change affects permissions, the state machine, data meaning or the op format.
2. `src/domain/catalog.ts`: the definition (scopes, exact schema, `check`, `effects`, `revertible`). `effects` must be pure and deterministic. A rule that depends on the status returns `superseded`, not an error (`docs/data-model.md` §6.1).
3. `src/domain/permissions.ts`: a row in `PERMISSIONS`.
4. `test/unit/authorize.test.ts`: the expected rights in the independent lists.
5. A new status or transition: `src/domain/status.ts` and the matrix `EXPECTED` in `test/unit/status.test.ts`.
6. Revert: a create op needs a case in `removeWrites` (`src/domain/domain.ts`). A derived field needs `isDerived`.
7. Notifications (`src/domain/notifications.ts`), the UI labels (`src/ui/i18n.ts`) and the Czech audit texts (`FIELD_TEXT` in `src/ui/i18n.ts`).
8. `docs/data-model.md`: the catalogue row (payload, who, effects, inverse). The guides (`docs/user-guide.md`, `docs/admin-guide.md`) if users or admins see the change.
9. Run the definition of done.

## 6. Working rules

1. **Stop and ask** the owner before you change the op format, the permission matrix or the status state machine. Record the question and the answer in `docs/open-questions.md`.
2. **Temporary files** (probes, screenshots, test folders) go to a temporary directory outside the repository.
3. **Language.** Docs, comments and commit messages: English in Simplified Technical English style. UI text: Czech, in `src/ui/i18n.ts`. The guides `docs/user-guide.md` and `docs/admin-guide.md`: Czech.
4. **The guides are part of the app.** The build bundles them, and the app shows them (**Nápověda**, **Příručka správce**). Keep them correct for the current version: use the exact button names from `src/ui/i18n.ts`. Their parser (`src/ui/docs.ts`) supports headings, paragraphs, notes (`> `), flat lists (no nested lists), images from `docs/img/` (`![text](img/<name>.jpg)`, made by `scripts/screenshots.mjs` from synthetic demo data) and links inside the app (`#/help?s=<section>`). Do not use external URLs (the build check refuses them). `test/unit/docs.test.ts` checks these rules and the links.

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
- Docs are updated: `docs/*.md`, an ADR for a significant decision, `docs/open-questions.md`, `docs/user-guide.md` and `docs/admin-guide.md` for visible changes.
- No real user data in `git status`.
- The expert review (§7, step 3) ran before each commit.
