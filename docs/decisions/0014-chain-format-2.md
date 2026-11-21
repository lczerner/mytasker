# 0014. Chain format 2: links by prevHash, gaps in seq permitted

- Status: accepted (owner, 2026-11-19, Q-24)
- Date: 2026-11-19

## Context

All users must write in `data/`, so each user can also write files in the folder of another user. In chain format 1, the numbers of an author had to have no gaps. A file of another person under the next number of Petr (any content) blocked all later writes of Petr: his app could not use that number, and it could not skip it. The file is not signed. Only the OneDrive history of the file shows which account saved it.

## Decision

1. Only validly signed ops of the author are members of a chain. Other files in the author folder are integrity issues, and the chain skips them.
2. The chain follows the `prevHash` links from the first op (`prevHash` = null). `seq` must increase along the chain, but it can have gaps. The HLC must increase too.
3. An op whose previous op is not present waits (`chain-gap`). Thus a deleted or changed op still stops the chain at the next op.
4. 2 valid ops with the same `seq`, or with the same `prevHash`, are a fork. The chain stops before them.
5. The writer reads the unknown files of its own folder, takes its own last valid op, and writes the smallest free number above it, with the `prevHash` of that op.

The code is in `oplog-core` (`verify.ts` `checkChains`, `engine.ts` `write`).

## Consequences

- A NEW file of another person cannot block an author. To block an author in this way, a person must fill all following numbers, which is not possible in practice.
- Limit: a person who changes or deletes an EXISTING op file of an author stops that chain at the next op (`chain-gap`), and all later ops of the author wait. The integrity view shows it. Repair: restore the file from the OneDrive version history or recycle bin (`docs/operations.md`, Phase 6).
- Limit: an author can stop the own chain with a second signed op after an old own op (a fork). Format 1 permitted the same with a conflict-copy name. All clients agree on the result.
- A quick scan lists the folders of the known authors, so a gap in the numbers does not stop it. Cutoffs (`RemoveUser`) and checkpoint frontiers use the head of the valid chain (`Engine.validHeads`), not a file with a higher number and a bad signature.
- Deletion, change and forks are detected as before.
- Chain format 1 data stays valid in format 2 (no gaps is a special case).
