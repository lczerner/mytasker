# 0012. Flat comments with mentions

- Status: accepted (Q-4, owner, 2026-11-19)
- Date: 2026-11-19

## Decision

Comments are a flat list, sorted by time. A comment can mention users with `@Name`. The UI offers a list of users after `@` and stores the user IDs in `mentions`.

## Reasons

- A small team has short conversations on 1 task. Threads add UI and data complexity with little value.
- A flat list is easy to read on a narrow side panel.

## Consequences

A comment has no `parentId`. If threads are necessary later, a new optional field `replyTo` can be added with no format break.
