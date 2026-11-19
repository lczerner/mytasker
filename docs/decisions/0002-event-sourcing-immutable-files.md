# 0002. Event sourcing over immutable, per-author op files

- Status: accepted (from the task, same as `system-vzdelavani` ADR 0001)
- Date: 2026-11-19

## Decision

Each change is 1 new JSON file `<scope>/ops/<authorKeyId>/<seq>.json`. Nobody changes or deletes an op file. The client replays all valid ops in the total order `(hlc.t, hlc.c, authorKeyId, seq, scope)`.

## Consequences

- OneDrive never has 2 versions of 1 op file, so it makes no conflict copies of ops.
- The op log is the audit log. Ops stay forever.
- The number of files grows. Checkpoints (ADR 0007) keep the start fast.
