# 0007. Checkpoints are signed packs of the original ops

- Status: accepted (same as in the earlier app of the owner)
- Date: 2026-11-19

## Context

A snapshot of the state at 1 point of the order is a problem. An offline user can sync an op later that sorts before that point. A client that started from the snapshot then cannot replay correctly.

## Decision

A checkpoint is 1 file with the original signed op envelopes up to a frontier, signed by an admin. The client verifies each envelope in the pack like an op file. The state never depends on trust in the author of the checkpoint.

## Consequences

- A new client reads a few large files instead of 100 000 small files.
- The op files stay for the audit log.
- Phase 7 measures whether this is sufficient for 100 000 ops.
