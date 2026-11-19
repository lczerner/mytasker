# 0009. Status changes are separate op types, checked against the actual status

- Status: proposed
- Date: 2026-11-19

## Decision

1. Each status change is its own op type: `PostponeTask`, `ResumeTask`, `CompleteTask`, `VerifyTask`, `ReturnTask`, `ReopenTask`, `DeleteTask`, `RestoreTask`. The permission matrix is then 1 row for each op type.
2. The transitions are a data table (`src/domain/status.ts`). Tests check every (status × op) pair.
3. Each op has `from`. The replay applies the op if the transition is valid from the **actual** status at that point in the order. Else the op is **superseded**: no effect, it shows in the history, and the author gets a notification.
4. Superseded is not rejected. The op is valid and authorized. It stays in the audit log with the status `superseded`. The integrity view does not show it.

## Consequences

- 2 concurrent status changes converge. All clients agree which op won.
- `oplog-core` needs the audit status `superseded` (ADR 0001).
