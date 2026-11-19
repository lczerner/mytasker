# Open questions

Each open question has a proposal. When the owner answers, the question moves to §2 with the answer and the date.

## 1. Open

No open questions.

## 2. Answered

| ID | Question | Answer | Date |
|---|---|---|---|
| A-1 | Reuse the core of `system-vzdelavani`? | Yes. New shared repository `~/Projects/oplog-core`, git dependency pinned to a commit. `system-vzdelavani` migrates later. | 2026-11-19 |
| A-2 | Signature algorithm? | Ed25519. | 2026-11-19 |
| A-3 | The file `functions` with the first requirements? | Move to `docs/requirements-original.md`. | 2026-11-19 |
| A-4 | Name of the default git branch? | `master`. | 2026-11-19 |
| Q-2 | Can every user assign and unassign any user on any task? | Yes. | 2026-11-19 |
| Q-3 | Edge version in the organisation? | Edge 137 or later is acceptable. | 2026-11-19 |
| Q-6 | Can users edit a `verified` task? | No. Only comments. An admin reopens the task to change it. A `done` task is editable. | 2026-11-19 |
| Q-7 | Is the due date required? | No. The due date is optional and can be empty. | 2026-11-19 |
| Q-16 | Remotes of `oplog-core` and `mytasker`? | None yet. The owner creates them later. Until then, commit on `master` and use `file:../oplog-core`. | 2026-11-19 |
| Q-1 | Can all users read all tasks? | Proposal accepted: Yes. The task says so. Separate teams with secret tasks need separate shared folders. | 2026-11-19 |
| Q-4 | Flat or threaded comments? | Proposal accepted: Flat, with `@mentions` (ADR 0012). | 2026-11-19 |
| Q-5 | Can a user mark a `postponed` task done directly? | Proposal accepted: No. The task says "assigned or new". The user resumes the task first. The panel shows "Obnovit" for postponed tasks. | 2026-11-19 |
| Q-8 | Can a user delete a task that they created, also if it is assigned to other users or `done`? | Proposal accepted: Yes, as in the task. Only admins can restore it. | 2026-11-19 |
| Q-9 | Who gets the "returned for rework" notification? | Proposal accepted: All assignees, and the user who marked the task done. | 2026-11-19 |
| Q-10 | Do tags need colors? | Proposal accepted: Yes, automatic: 1 color from a fixed palette of 8, from the hash of the tag ID. No color setting in the first version. | 2026-11-19 |
| Q-11 | Does separation of duties apply (the user who marked a task done cannot verify it)? | No. Verifiers and admins can always verify, also their own work. There is no setting for this rule. | 2026-11-19 |
| Q-12 | Who can change `completedAt` after "Hotovo"? | Proposal accepted: The user who marked it done, and admins. Only while the status is `done`. | 2026-11-19 |
| Q-13 | After `RestoreTask`, which status does the task get? | Proposal accepted: The status before the deletion. The due date stays. | 2026-11-19 |
| Q-14 | Browser notifications on `file://`: can you test them in Edge on a work computer? Group policy can block them. | Proposal accepted: Keep them optional and off by default. I add a test button in the settings. | 2026-11-19 |
| Q-15 | Drag and drop on the board? | Proposal accepted: Not in the first version. Status changes with buttons in the task panel. | 2026-11-19 |
| Q-17 | `enroll/`: OneDrive can usually not give "write but not read" to a folder. Is it acceptable that all users can read enrollment requests? | Proposal accepted: Yes. A request contains only a public key and a display name. No secret. | 2026-11-19 |
| Q-7a | If a due date has no time, when is the task due? | Proposal accepted: At 23:59 Europe/Prague on that day. The time is optional. | 2026-11-19 |
| Q-18 | How many users and how many tasks per year do you expect? | Proposal accepted: I test with 5 000 tasks and 100 000 ops, as in the task. | 2026-11-19 |
| Q-19 | Dark theme in the first version? | Proposal accepted: No. Light theme first. The CSS uses tokens, so a dark theme is a later, small change. | 2026-11-19 |
| Q-20 | Can an admin assign the `verifier` flag to themselves, and is every admin a verifier? | Proposal accepted: Admins can verify (the task matrix says so). The `verifier` flag is for non-admin users. | 2026-11-19 |
| Q-21 | Can the creator delete a `verified` task? | No. Only an admin can delete a `verified` task. | 2026-11-19 |
| Q-22 | Must the app store the folder handle? How to treat attachments that a browser runs as pages? | Store the handle. The owner accepts the risk (`docs/security-model.md` §4). Block attachments of HTML, SVG and similar types in the UI and in the replay. Download names of other types get `.txt` if the extension is not on the safe list. | 2026-11-19 |
| Q-23 | 3 new op-format rules from the security review of `oplog-core`: HLC limits (`hlc.t` ≤ the year 9999, `hlc.c` ≤ 2 147 483 647), only the canonical base64url text of `sig`, at most 32 levels of nesting. Also: no field `overwritten` in a `Revert` payload. | Approved. | 2026-11-19 |
| Q-24 | Any user can save a file under the next op number of another user and block all writes of that user forever. How to fix it? | Option A: change the chain rule in `oplog-core`. The chain follows the `prevHash` links, the numbers must increase but can have gaps, and files that are not validly signed ops of the author are skipped (integrity issue). The writer takes the smallest free number above its last valid op. `system-vzdelavani` gets it with its migration to `oplog-core`. | 2026-11-19 |
