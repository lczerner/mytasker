# AGENTS.md – instructions for coding agents

Status: complete for version 0.1. §7 (Git workflow) applies since the GitHub remote exists.

## 1. Purpose

Tasks ("Úkoly" in the Czech UI, repository `mytasker`) is a task manager for a small team. The app is 1 HTML file in a shared OneDrive folder. It runs in Edge or Chrome over `file://`. The data is a log of signed, immutable JSON op files. See `docs/architecture.md` and `docs/data-model.md`.

## 2. Constraints (non-negotiable)

1. **No server.** No backend, sync service, push or email service, cloud function, Microsoft Graph or app registration.
2. **1 self-contained `index.html`**, opened over `file://`. All JS and CSS are inline.
3. **No network requests at runtime.** The CSP has `default-src 'none'` and `connect-src 'none'`. Do not add CDNs, fonts or `fetch` calls.
4. **Desktop Edge or Chrome 137 or later.** File System Access API, WebCrypto Ed25519.
5. **No real user data in git.** Tests, docs, fixtures and screenshots use synthetic data only.
6. Runtime dependencies: Preact and `oplog-core` only. A new runtime dependency needs the owner's approval.
7. The UI is in Czech (the default) and English (`docs/architecture.md` §8). All strings are in `src/ui/i18n.ts`, with a text in both languages.

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
| `src/ui/` | Preact UI: start screens (`Gate.tsx`), shell (`App.tsx`), task list, task panel, dialogs, admin screens (`admin.tsx`), audit, revert and integrity (`audit.tsx`), notifications (`Notifications.tsx`), built-in guides (`Help.tsx`, parser `docs.ts`), information bar (`Footer.tsx`), safe Markdown (`markdown.ts`), `i18n.ts` (all texts, Czech and English), `lang.tsx` (the language switch), `styles.css`. |
| `test/` | `unit` (state machine and `authorize` matrices, domain rules), `property` (convergence), `simulation` (multi-user on disk, attacks), `e2e`, `perf`, `fixtures` (synthetic only). `helpers.ts` makes a synthetic team. |
| `docs/` | User guide and admin guide (Czech, built into the app), operations, architecture, data model, security model, wireframes, review checklist, ADRs, open questions. |
| `scripts/` | `check-build.mjs` (build check, also the third-party notices), `release.mjs` (release package and archive), `zip.mjs` (ZIP writer of the archive), `sbom.mjs` (SBOM and its checks), `oplog-core-ref.mjs` (the pinned oplog-core commit), `commit.mjs` (the commit of a build), `screenshots.mjs` (guide images and the README image). |
| `release/` | `create-folders.sh` (empty folder skeleton). `release/app/`, `release/*.zip` and `release/sbom/` are generated and git-ignored. |
| `.claude/agents/mt-reviewer.md` | Claude Code subagent for the expert review (uses `docs/review-checklist.md`). |
| `Makefile` | Wrapper targets. `make help` lists them. |
| `.github/` | `workflows/ci.yml` (CI for pull requests and `master`), `dependabot.yml` (§7.2). |
| `.oplog-core-ref` | The oplog-core commit that the CI uses (§7.1). |
| `README.md`, `LICENSE`, `THIRD-PARTY-NOTICES.md` | Overview, license, licenses of the bundled packages. A new runtime dependency needs a section in `THIRD-PARTY-NOTICES.md` (the build check fails without it). |

## 5. Commands

`make help` lists all targets. `make check` runs the checks before each commit. `make sbom` writes the SBOMs (§7.2). `make oplog-core-ref` pins the oplog-core commit (§7.1).

```sh
npm install            # or make install (npm ci)
npm test               # unit + property + simulation
npm run typecheck
npm run build          # dist/index.html + build check (needs Chromium, SKIP_BROWSER=1 skips it)
npm run simulate
npm run test:e2e       # build + browser tests (CHROMIUM=/path/to/chromium)
npm run release        # release/app/: index.html, LICENSE, THIRD-PARTY-NOTICES.md, VERSION, SHA256SUMS; release/mytasker-<version>.zip
```

`npm run test:e2e` runs the demo flows, the real flow with OPFS (new installation, enrollment, approval) and the layout test. `make demo` builds and prints the URL of the demo mode (`?demo`, `?demo=petr`, `?demo=large`). `npm run perf` measures 5 000 tasks with about 100 000 ops (`docs/performance.md`); `dist/index.html?demo=perf` measures the UI. `node scripts/screenshots.mjs` (after a build) makes the guide images `docs/img/*.jpg` and the README image `docs/readme/app.jpg` from the demo. Build from a clean commit first, or the footer in the images shows "-dirty". The build bundles `docs/img/` but not `docs/readme/`. `SIM_SEED` and `SIM_ROUNDS` change the simulation run.

## 5a. Checklist: add a new op type or status

1. Ask the owner first if the change affects permissions, the state machine, data meaning or the op format.
2. `src/domain/catalog.ts`: the definition (scopes, exact schema, `check`, `effects`, `revertible`). `effects` must be pure and deterministic. A rule that depends on the status returns `superseded`, not an error (`docs/data-model.md` §6.1).
3. `src/domain/permissions.ts`: a row in `PERMISSIONS`.
4. `test/unit/authorize.test.ts`: the expected rights in the independent lists.
5. A new status or transition: `src/domain/status.ts` and the matrix `EXPECTED` in `test/unit/status.test.ts`.
6. Revert: a create op needs a case in `removeWrites` (`src/domain/domain.ts`). A derived field needs `isDerived`.
7. Notifications (`src/domain/notifications.ts`), the UI labels and the audit texts (`OP_LABEL`, `FIELD_TEXT`) in `src/ui/i18n.ts`, in Czech and English.
8. `docs/data-model.md`: the catalogue row (payload, who, effects, inverse). The guides (`docs/user-guide.md`, `docs/admin-guide.md`) if users or admins see the change.
9. Run the definition of done.

## 6. Working rules

1. **Stop and ask** the owner before you change the op format, the permission matrix or the status state machine. Record the question and the answer in `docs/open-questions.md`.
2. **Temporary files** (probes, screenshots, test folders) go to a temporary directory outside the repository.
3. **Language.** Docs, comments and commit messages: English in Simplified Technical English style. UI text: Czech and English, in `src/ui/i18n.ts`. The guides `docs/user-guide.md` and `docs/admin-guide.md`: Czech.
4. **The guides are part of the app.** The build bundles them, and the app shows them (**Nápověda**, **Příručka správce**). Keep them correct for the current version: use the exact button names from `src/ui/i18n.ts`. Their parser (`src/ui/docs.ts`) supports headings, paragraphs, notes (`> `), flat lists (no nested lists), images from `docs/img/` (`![text](img/<name>.jpg)`, made by `scripts/screenshots.mjs` from synthetic demo data) and links inside the app (`#/help?s=<section>`). Do not use external URLs (the build check refuses them). `test/unit/docs.test.ts` checks these rules and the links.

## 7. Git workflow

Remote: `github.com/lczerner/mytasker`. The default branch `master` is protected.

1. **Never commit on `master`, and never push `master`.** All changes come to `master` through a pull request.
2. **Work on a branch.** Start each piece of work on a new branch from the current `origin/master`: `git fetch origin && git switch -c <short-topic> origin/master`. Use 1 branch for 1 topic. If the owner asks for several changes on 1 branch, keep them on that branch.
3. **Commit on the branch** after the checks and the expert review (step 5). A branch can have several commits.
4. **Push and create the pull request only when the owner says so.** Then:
   1. `git push -u origin <branch>`.
   2. `gh pr create --base master` with a title in Simplified Technical English and a body with: the summary, the checks that passed, the review result (as in the commit messages), and the attribution line.
   3. Watch the CI (`gh pr checks`). If it fails, fix the cause on the same branch and push again (the owner's command for this PR covers the fixes).
   4. The owner merges. Never merge, close or force-push without the owner's command.
5. **Expert review before every commit.** This rule applies to all changes, also to small changes and to changes of documentation only.
   1. Make sure that `make check` passes (oplog-core check, typecheck, tests, build check, SBOM), and `npm run test:e2e` for UI changes.
   2. Give an independent expert reviewer the intent, the changed files, the diff and the checks that passed. The reviewer applies `docs/review-checklist.md`. The reviewer must be a separate agent (a subagent or a new session), not the author. It must use a model at least as strong as the author's. In Claude Code, use the subagent `mt-reviewer` (§9).
   3. Fix all valid findings. Run the checks again after the fixes. If a fix changes more than the finding asks for, review again.
   4. If you do not fix a finding, tell the owner why, and write it in the commit message.
6. **Commit messages** in Simplified Technical English, with a "Review:" paragraph: what the reviewer found and what you did with each finding.
7. **After the merge** (when the owner says so): `git switch master && git pull --ff-only`, then delete the local branch.

### 7.1 oplog-core

mytasker uses the repository `lczerner/oplog-core` as `file:../oplog-core`. `.oplog-core-ref` pins the commit that the CI checks out.

1. A change in oplog-core is a separate pull request in oplog-core, with its own rules (its `AGENTS.md`).
2. After the oplog-core commit: `make oplog-core-ref` in mytasker, and commit `.oplog-core-ref` on the mytasker branch. `make check` and `make release` fail if the code of `../oplog-core` differs from the pinned commit.
3. The CI can check out only a pushed commit. Push the oplog-core branch (on the owner's command) before the mytasker pull request. The owner merges the oplog-core pull request first.
4. After that merge, pin the commit on oplog-core `master`: `git -C ../oplog-core switch master && git -C ../oplog-core pull --ff-only`, then `make oplog-core-ref`, and commit `.oplog-core-ref` on the mytasker branch before the owner merges it. Reason: a squash merge or a rebase merge makes a new commit, and the commit of the branch is then not on `master`.
5. `lczerner/oplog-core` is a public repository. The CI checks it out at the pinned commit with no key and no secret. Thus the CI also runs for pull requests from forks and for Dependabot pull requests.

### 7.2 CI, SBOM and Dependabot

- **CI** (`.github/workflows/ci.yml`) runs for each pull request and for each push to `master`: typecheck, tests, SBOM with its checks, `npm audit` of the runtime dependencies, build check and browser tests. It uploads the SBOM and the app as artifacts. A pull request must have a green CI before the merge.
- **SBOM:** `make sbom` writes `release/sbom/runtime.cdx.json` (the packages inside `index.html`) and `release/sbom/build.cdx.json` (all packages), and checks that each runtime dependency is in the runtime SBOM and in `THIRD-PARTY-NOTICES.md`. `SBOM_FORMAT=spdx` writes SPDX. `make check`, `make release` and the CI regenerate the SBOM. Run `make sbom` after each change of `package.json`, `package-lock.json` or `.oplog-core-ref`. `release/sbom/` is generated and git-ignored.
- **Dependabot** (`.github/dependabot.yml`) opens weekly pull requests for npm and GitHub Actions, and security updates at once. Treat a Dependabot pull request like any other: the checks and the review apply. A `preact` update must also update its section in `THIRD-PARTY-NOTICES.md` on the Dependabot branch (the build check and the SBOM check fail without it). Push to a Dependabot branch only on the owner's command.

## 8. Definition of done

- `make check` passes: the oplog-core check, `npm run typecheck`, `npm test` (includes the property test and the simulation), `npm run build` and `make sbom`.
- `npm run test:e2e` passes for UI changes.
- Docs are updated: `docs/*.md`, an ADR for a significant decision, `docs/open-questions.md`, `docs/user-guide.md` and `docs/admin-guide.md` for visible changes.
- No real user data in `git status`.
- The expert review (§7, step 5) ran before each commit.

## 9. Claude Code

- Run the expert review of §7 step 5 with the Claude Code subagent `mt-reviewer` (`.claude/agents/mt-reviewer.md`).
- Do not give a `model` or an `effort` override when you start the reviewer. Do not set a default subagent model (setting or `CLAUDE_CODE_SUBAGENT_MODEL`) for this project: it replaces the model of every subagent, also of the reviewer.
