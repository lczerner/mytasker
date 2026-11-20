# Úkoly (mytasker)

Úkoly is a task manager for a small team. It has no server. The app is 1 HTML file in a shared OneDrive folder. Each user opens it from the local copy of the folder in Edge or Chrome over `file://`. OneDrive syncs the changes between the computers.

- Each change is a signed, immutable JSON file (an op). Each computer checks all ops and computes the same state.
- No network access at runtime. The content security policy blocks it, and the build check verifies it.
- The UI is in Czech. The app contains a user guide (**Nápověda**) and an admin guide (**Příručka správce**).

## Constraints

- No server, no sync service, no push or email, no Microsoft Graph. The only shared infrastructure is a OneDrive folder that each computer syncs.
- Desktop Microsoft Edge or Google Chrome, version 137 or later (File System Access API, WebCrypto Ed25519).
- 1 self-contained `index.html`. All code, styles, guides and images are inside it.

## Quick start (development)

Requirements: Node.js 22 or later, Chromium for the build check and the browser tests, and the private repository `oplog-core` next to this one:

```sh
git clone https://github.com/lczerner/oplog-core.git ../oplog-core
git -C ../oplog-core checkout "$(cat .oplog-core-ref)"   # the commit that this version uses
npm ci --prefix ../oplog-core
```

```sh
make install      # install the dependencies
make check        # oplog-core check, typecheck, tests (unit, property, simulation), build check, SBOM
make demo         # build the demo and print its URL (synthetic data in memory, nothing is saved)
npm run test:e2e  # browser tests
make release      # release package in release/app/ and SBOMs in release/sbom/
make sbom         # SBOMs only (runtime + build, CycloneDX, or SPDX with SBOM_FORMAT=spdx)
make help         # all targets
```

`make test-folder` makes a local test folder (`~/mytasker-test`) with the current release.

## Deploy to OneDrive

1. Run `make release` on a trusted computer. The package is in `release/app/`: `index.html`, `LICENSE`, `THIRD-PARTY-NOTICES.md`, `VERSION`, `SHA256SUMS`.
2. Make a folder on OneDrive or SharePoint, for example `Úkoly`, with these subfolders: `app`, `roles/ops`, `roles/checkpoints`, `data/ops`, `data/checkpoints`, `data/files`, `enroll` (`release/create-folders.sh <root>` makes them).
3. Copy the content of `release/app/` to `app/`.
4. Set the permissions:

| Folder | Write | Read | Content |
|---|---|---|---|
| `app/` | admins | all | The app, `trust-root.json`, `VERSION`, `SHA256SUMS` |
| `roles/` | admins | all | Users, keys, roles, settings |
| `data/` | all | all | Task ops, checkpoints, attachment files |
| `enroll/` | all | admins (if OneDrive permits it) | Access requests |

5. Share the folder with the team. Each user syncs it to the computer ("Vždy ponechat na tomto zařízení" is recommended).

## First admin and new users

1. The first admin opens `app/index.html`, selects the shared folder and clicks **Vytvořit novou instalaci**. The admin saves the key file in a personal folder (never in the shared folder). The app writes `app/trust-root.json` and shows its fingerprint.
2. A new user opens the app, clicks **Jsem nový uživatel / mám nový počítač**, creates a key and gets a fingerprint. The app sends the access request.
3. The admin compares the fingerprint by phone or in person, then approves the request in **Správa → Žádosti**.
4. Make a second root admin soon (`docs/operations.md` §4.1).

## Daily use

Each user opens `app/index.html` from the shared folder and unlocks the key with the passphrase. The guides in the app describe the work: **Nápověda** (the key `?`) for all users, **Příručka správce** for admins.

## Backup

- OneDrive keeps a version history and a recycle bin. A deleted or changed file can be restored.
- Copy the full shared folder to another safe place 1 time each month.
- Details: `docs/operations.md` §7.

## Limitations

- All users can read all data. The data in the shared folder is not encrypted.
- An admin can do everything, also replace the app file.
- The time of a change comes from the computer of its author. The app cannot check it.
- `app/index.html` is a supply-chain point. Copy only checked releases (`SHA256SUMS`).
- All local HTML files in the browser share 1 storage origin (`file://`). The key file and the cache are encrypted.
- Notifications show only while the app is open. No email or push.
- A lost key or passphrase cannot be restored. The admin approves a new key.
- The first start on a new computer with about 100 000 ops takes about 10 seconds (`docs/performance.md`).

The full list is in `docs/security-model.md`.

## Documents

| Document | Content |
|---|---|
| `docs/user-guide.md` | User guide (Czech). In the app: **Nápověda** or the key `?`. |
| `docs/admin-guide.md` | Admin guide (Czech). In the app: **Příručka správce** (admins only). |
| `docs/operations.md` | Build, release, installation, manual procedures, attachment purge, repair, backup. |
| `docs/performance.md` | Measurements with 5 000 tasks and about 100 000 ops. |
| `docs/architecture.md` | Architecture, folder layout, op lifecycle. |
| `docs/data-model.md` | Entities, op catalogue, permissions, status state machine, revert, notifications. |
| `docs/security-model.md` | Assets, protections, known limitations. |
| `docs/ui-wireframes.md` | Screens and keyboard. |
| `docs/decisions/` | Architecture decision records. |
| `docs/open-questions.md` | Questions and the decisions of the owner. |
| `AGENTS.md` | Instructions for coding agents and contributors, including the Git workflow (branches, pull requests, CI, SBOM, Dependabot). |

## License

MIT, see `LICENSE`. Copyright 2026, Lukáš Czerner. The bundled packages and their licenses are in `THIRD-PARTY-NOTICES.md`.
