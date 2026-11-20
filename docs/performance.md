# Performance

Status: measured on 2026-11-20 (Phase 7). The target of the spec: about 5 000 tasks with about 100 000 ops. Measure the cold start and the refresh, and use checkpoints if necessary.

## 1. Method

- **Data:** `src/app/perfdata.ts` makes a synthetic team of 8 users and 5 000 tasks with about 20 ops each (101 788 ops). Each task has a creation, an assignee, a tag, 3 subtasks, comments, edits and status changes. All ops are valid, signed and chained (a test checks this for a small run).
- **Node** (`npm run perf`, `test/perf/perf.test.ts`): the ops are files in a temporary folder on the local disk (`NodeFsStorage`). The test measures the engine and the UI model without the DOM.
- **Browser** (`dist/index.html?demo=perf`, parameters `tasks` and `per`): the same data in memory (`MemoryStorage`), the admin as the user, the full UI in Chromium. The script measures the time from an action until its result shows.
- **Computer:** AMD Ryzen 7 8845HS (16 threads), Linux, Node 22.23, Chromium 155. 2 runs of the same measurement differ by up to about 15 %.

The local disk is faster than OneDrive on Windows. On Windows, the read of many small files is much slower: there, the file reads can be a large part of the cold start. Checkpoints reduce them (§4).

## 2. Results: engine (Node, 101 788 ops on disk)

| Measurement | Result |
|---|---|
| Cold start: full scan (read, verify each signature and chain, replay) | 10.1 s |
| UI model: task views, search index, notifications | 0.22 s |
| Refresh without a change: quick scan (each poll) | 7 ms |
| Refresh without a change: full scan (each 8th poll) | 0.34 s |
| Write 1 op (check, sign, file) | 0.37 s |
| Refresh after 1 new op of another user: quick scan | 0.35 s |
| Warm start: cache import and quick scan (the app adds the decryption) | 2.1 s, cache 72 MB as JSON |
| Create the checkpoints (roles and data) | 3.8 s |
| Cold start with checkpoints | 10.3 s |

## 3. Results: UI (Chromium, 5 000 tasks, 101 788 ops in memory)

| Measurement | Result |
|---|---|
| Cold start: full scan in the browser | 10.5 s |
| First render of the board after the scan | 0.41 s |
| Search (type a query, until the result shows) | 0.09 s |
| Open a task | 0.21 s |
| Switch to the table | 0.08 s |
| Open "Moje úkoly" | 0.02 s |
| Open the audit (101 788 entries) | 0.09 s |
| First text filter in the audit (builds the search cache) | 0.52 s |
| Write 1 comment, until it shows (write, replay, UI model, render) | 0.69 s |
| JS heap | about 360 MB |

## 4. Changes from the measurement

The first measurement showed these problems. Phase 7 fixed them:

1. **The scan waited for each file.** The engine read and verified 1 file at a time, so it mostly waited for the storage and WebCrypto. `oplog-core` now reads and verifies up to 32 files at the same time. 10 000 ops: 3.4 s → 1.0 s. At 100 000 ops, the CPU is the limit (11.3 s → 10.1 s).
2. **Each recompute checked all chains again.** `oplog-core` now keeps the chain check of each author and checks a chain again only if its input changed (path, hash and signature status of each op). Tests: `test/unit/chain-cache.test.ts` (a gap that closes, a key that becomes known).
3. **The board rendered all cards.** With 5 000 tasks, the board had 3 231 cards. Now a column shows 100 cards and a button **Zobrazit další …** (for example "Zobrazit dalších 100"), and the table shows 200 rows at a time. The counts show all tasks. Board: 1.4 s → 0.4 s. A new comment: 1.4 s → 0.5–0.7 s. Open a task: 0.4 s → 0.1–0.2 s.

## 5. Limits and recommendations

- **The cold start is about 10 s at 100 000 ops** on a fast computer, more on a slow computer or on Windows with OneDrive. It happens 1 time on each computer (and after a change of the trust root). Later starts use the encrypted cache.
- **A checkpoint does not make the cold start faster on the local disk.** The app checks the signature of each op in a checkpoint again, so that an admin cannot put forged ops of other users into a checkpoint (`docs/security-model.md`). A checkpoint replaces many small file reads with 1 file. That helps on OneDrive, where each file read is slow. Recommendation: make a checkpoint when more than about 2 000 op files are outside checkpoints.
- **Each write and each refresh with new ops takes about 0.35 s at 100 000 ops**, because `recompute` still has loops over all ops (signature status, the input of the chain cache, the future-clock check). A small team writes far fewer ops: at 10 000 ops, these steps take about 40 ms.
- **Memory:** about 360 MB of JS heap in the browser at 100 000 ops. The engine keeps all ops in memory, because the replay and the audit need them.
- **The cache** is 72 MB of JSON at 100 000 ops before the encryption. It is in IndexedDB on each computer.
- **Possible next steps** if a team gets near these numbers: make `recompute` incremental also for the signature status and the future-clock check, keep the check result of a checkpoint (signed by a trusted admin) for the ops of that admin only, and build the UI model incrementally.

## 6. Commands

```sh
npm run perf                       # Node, 5 000 tasks (PERF_TASKS=500 for a short run)
npm run build                      # then open dist/index.html?demo=perf (or ?demo=perf&tasks=500)
```

In the browser, `window.__perf` has the times of the generation and of the scan.
