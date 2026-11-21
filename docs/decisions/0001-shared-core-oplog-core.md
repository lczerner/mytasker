# 0001. Shared core library `oplog-core`

- Status: accepted (owner, 2026-11-19)
- Date: 2026-11-19

## Context

An earlier app of the owner has the same architecture: signed op files on OneDrive, JCS, Ed25519, HLC, replay, `authorize`, File System Access storage. Its core has about 700 lines of generic code (canonical JSON, encoding, crypto, HLC, IDs, verify, storage). `replay.ts`, `engine.ts` and `revert.ts` are generic in principle, but they import the domain catalogue and the domain `authorize`.

## Decision

1. Make a new repository `oplog-core` (now `lczerner/oplog-core`). Move the generic code into it.
2. `replay`, `engine` and `revert` get the domain through a `Domain` object (catalogue, `authorize`, scopes, initial state, guards). See `docs/architecture.md` §2.
3. `mytasker` uses `oplog-core` as a git dependency, pinned to a commit.
4. The earlier app does not change now. It migrates to `oplog-core` later, in a separate change.

## Consequences

- 1 implementation of the security-critical code. A fix in `oplog-core` helps both apps.
- The tests of the generic code move to `oplog-core`. `mytasker` tests its domain and the integration.
- A git dependency needs a remote. No remote exists yet (Q-16). Until the owner creates one, `mytasker` uses a `file:../oplog-core` dependency (the sibling folder `../oplog-core`).
- Until the earlier app migrates, 2 copies of the core exist. A security fix must go into both.

Update 2026-11-20 (Q-27): `oplog-core` is now the repository `lczerner/oplog-core`. mytasker pins its commit in `.oplog-core-ref` (AGENTS.md §7.1).

Update 2026-11-21 (Q-28): `lczerner/oplog-core` is a public repository. The CI checks out the pinned commit with no key.
