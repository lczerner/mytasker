# 0010. Conflict semantics: field LWW, element entities, fractional index

- Status: proposed
- Date: 2026-11-19

## Decision

- Scalar fields: last writer wins for each field, in the total order.
- Sets (assignees, tags of a task): 1 entity for each element (`<taskId>/<userId>`, `<taskId>/<tagId>`) with the field `on`. Last writer wins for each element.
- Lists (subtasks, comments, attachments, links): 1 entity for each item, with a status field for removal.
- Subtask order: a fractional index string (base 62). The UI sorts by `(pos, id)`.
- Tags with the same normalized name: the replay merges a later `CreateTag` into the earlier tag (`mergedInto`).

## Alternatives

- An add-wins set (OR-Set). Rejected: an add and a remove at the same time are rare in a small team, and LWW is easy to explain in the history.
- A list CRDT for subtasks. Rejected: fractional indexing is sufficient for short checklists.

## Consequences

`docs/data-model.md` §10 describes the rules for users and tests.
