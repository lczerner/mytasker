# Úkoly (mytasker)

Úkoly is a task manager for a small team. It has no server. The app is 1 HTML file in a shared OneDrive folder. Each user opens it from the local copy of the folder in Edge or Chrome over `file://`. OneDrive syncs the changes between the computers.

- Each change is a signed, immutable JSON file (an op). Each computer checks all ops and computes the same state.
- No network access at runtime. The content security policy blocks it.
- The UI is in Czech. The app contains a user guide and an admin guide.

## Documents

| Document | Content |
|---|---|
| `docs/user-guide.md` | User guide (Czech). In the app: **Nápověda** or the key `?`. |
| `docs/admin-guide.md` | Admin guide (Czech). In the app: **Příručka správce** (admins only). |
| `docs/operations.md` | Build, release, installation, manual procedures, repair, backup. |
| `docs/architecture.md` | Architecture, folder layout, op lifecycle. |
| `docs/data-model.md` | Entities, op catalogue, permissions, status state machine, revert, notifications. |
| `docs/security-model.md` | Assets, protections, known limitations. |
| `docs/ui-wireframes.md` | Screens and keyboard. |
| `docs/decisions/` | Architecture decision records. |
| `docs/open-questions.md` | Questions and the decisions of the owner. |
| `AGENTS.md` | Instructions for coding agents and contributors. |

## Quick start

Requirements: Node.js 22 or later, the sibling repository `../oplog-core`, and Chromium for the build check and the browser tests.

```sh
make install      # install the dependencies
make check        # typecheck, tests, build check
make demo         # build the demo and print its URL
make release      # release package in release/app/
make help         # all targets
```

The demo mode (`index.html?demo`) uses synthetic data in memory and writes nothing. `make test-folder` makes a local test folder with the current release.

## Browser support

Desktop Microsoft Edge or Google Chrome, version 137 or later (File System Access API, WebCrypto Ed25519).

## License

MIT, see `LICENSE`. Copyright 2026, Lukáš Czerner. The bundled packages and their licenses are in `THIRD-PARTY-NOTICES.md`.
