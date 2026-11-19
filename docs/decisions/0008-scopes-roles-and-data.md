# 0008. 2 scopes: `roles` and `data`

- Status: proposed
- Date: 2026-11-19

## Context

Only admins can change users, roles and settings. OneDrive can limit write access per folder. All users must write task ops.

## Decision

- Scope `roles` (folder `roles/`, write: admins): users, keys, roles, verifier flags, settings.
- Scope `data` (folder `data/`, write: all): tasks, all task content, tags, attachment blobs.
- Each author has 1 hash chain per scope. `seq` starts at 1 in each scope.
- Tags are in `data`, because users create tags during operation. Admin tag ops (rename, merge, delete) are also in `data`. `authorize` limits them to admins.

## Consequences

- A user who can write to `roles/` because of a wrong OneDrive setting still cannot change roles. `authorize` rejects the op.
- The total order includes `scope` as the last key, because 1 author has 2 ops with the same `seq`.
