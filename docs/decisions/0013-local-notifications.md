# 0013. Notifications are computed locally

- Status: proposed
- Date: 2026-11-19

## Context

There is no server, so there is no email and no push.

## Decision

1. At each refresh, the client computes the notifications of the current user from the state and the audit log (`docs/data-model.md` §12). Time is a parameter, so tests can set it.
2. The UI shows them as a bell with a count, badges in the sidebar, the count in the page title and a banner at start.
3. Browser notifications (Notification API) are optional and off by default. On 2026-11-19 I tested headless Chromium 155 over `file://`: `Notification` exists, the permission request is refused automatically in headless mode, and after a granted permission `new Notification()` operates. A test in a visible Edge window is still necessary (Q-14).

## Consequences

Users get notifications only while the app is open. The README and the user guide say this clearly.
