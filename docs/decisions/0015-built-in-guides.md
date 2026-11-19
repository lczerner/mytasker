# 0015. Built-in guides

- Status: accepted (owner, 2026-11-19)
- Date: 2026-11-19

## Context

The owner asked for documentation that users can read directly in the UI, and for a separate guide for admins. The app has no server and no network access at runtime. The users open the app over `file://`, and they cannot be expected to find Markdown files in the repository.

## Decision

1. The guides are Markdown files in the repository: `docs/user-guide.md` (all users) and `docs/admin-guide.md` (admins). Both are in Czech.
2. The build bundles them (`?raw` imports in `src/ui/Help.tsx`). Thus the guide always matches the version of the app, and no network access is necessary.
3. The app shows them on the page `#/help` (**Nápověda**, the key `?`, the information bar) and `#/help/admin` (**Příručka správce**, admins only). The start screens show the user guide in a dialog.
4. A separate parser (`src/ui/docs.ts`) renders them as Preact nodes. It adds headings with IDs, notes and local links `#/…` to the task Markdown. It never makes HTML text.
5. The admin guide is hidden from users who are not admins. It is not secret: the same file is in the app, and the procedures need admin rights.
6. `docs/operations.md` (English) has the technical procedures for the maintainer: build, release and the manual changes of the trust root.

## Consequences

- Each visible change must also update the guides (AGENTS.md §6).
- The guides cannot use external URLs (the build check refuses them) or nested lists (the parser does not support them). `test/unit/docs.test.ts` checks this and all local links.
- The app file is about 30 kB larger.
