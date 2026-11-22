# Security model

Status: complete for version 0.1 (Phase 6). A `Q-` number refers to `docs/open-questions.md`. The manual procedures are in `docs/operations.md`.

## 1. Assets and actors

| Asset | Where |
|---|---|
| Task data (all tasks, comments, attachments) | Shared OneDrive folder, not encrypted |
| Signing keys of the users | Key files in personal folders, wrapped with the passphrase |
| The app (`app/index.html`) and the trust root | `app/` in the shared folder |
| Local cache | IndexedDB of the `file://` origin, encrypted |

| Actor | Can |
|---|---|
| User | Read all data. Write files in `data/` and `enroll/`. |
| Admin | All that a user can. Write files in `app/` and `roles/`. |
| Other software on a user's computer | Read and write the local copy of the shared folder with the rights of the user. |
| A local HTML file that the user opens | Run script in the same `file://` origin as the app (§4). |

## 2. Protections

1. **Signatures.** Each op has an Ed25519 signature of its author. A changed op file fails the check.
2. **Hash chains.** Each op has the hash of the previous op of the author. A deleted or changed op stops the chain at the next op (`chain-gap`). 2 valid ops after the same op are a fork. A NEW file that another person saves under the next number of an author is not a valid op of that author: the chain skips it, and the author writes the next free number. A changed or deleted EXISTING op still stops the chain at the next op until somebody restores the file from the OneDrive version history (ADR 0014).
3. **`authorize` in every client.** Each client checks each op against the permission matrix at its point in the order. A user who can write to `roles/` because of a wrong OneDrive setting still cannot change roles.
4. **Revocation by `seq` cutoff.** The cutoff applies to all ops of the key, in any order (`docs/data-model.md` §6).
5. **Trust root.** `app/trust-root.json` defines the root admins. The app shows the fingerprints.
6. **No network.** The CSP blocks all network access: `default-src 'none'`, `connect-src 'none'`. The build check makes sure that the file has no external URLs.

## 3. XSS and rendering

An XSS in this app can use the unlocked signing key. It can then write ops in the name of the user. The app has these protections:

1. Preact escapes all text. The code never uses `dangerouslySetInnerHTML`.
2. The Markdown renderer makes Preact nodes, not an HTML string. Links are only `http:`, `https:` and `mailto:`. The replay validates the scheme of `AddLink` and `EditLink` too.
3. Only raster images (PNG, JPEG, GIF, WebP) show inline, from a `blob:` URL in an `<img>` element. The type comes from the first bytes of the file, not from the name or the op.
4. All other attachments download through a `blob:` URL with the type `application/octet-stream` and the `download` attribute.
5. **Active file types** (Q-22): the UI and the replay block attachments that a browser can run as a page (`.html`, `.svg` and others, listed in `docs/data-model.md` §11). The download name of every other attachment gets the extra extension `.txt` if its extension is not on a list of safe types. Reason: §4.
6. Links open in a new tab with `rel="noopener noreferrer"`.
7. **The built-in guides** (`docs/user-guide.md`, `docs/admin-guide.md`) are part of the build, not user input. Their parser (`src/ui/docs.ts`) also makes Preact nodes only. In addition to the task Markdown, it permits headings, notes and local links `#/…` with a short list of safe characters. A unit test checks that it refuses other schemes. The guides contain no external URLs (the build check refuses them).

## 4. The shared `file://` origin

On 2026-11-19 I tested Chromium 155: all local HTML files share 1 storage origin (`file://`). Thus each local HTML file that a user opens can read the IndexedDB and `localStorage` data of this app. The protections:

1. The key file and the cache are encrypted with keys from the passphrase (ADR 0006).
2. The signing key is a non-extractable `CryptoKey` in the memory of the app page only.
3. **The app stores the folder handle** in IndexedDB, so the user does not select the folder at each start. **Accepted risk** (owner, 2026-11-19, Q-22): any local HTML file can read the handle and ask for write permission to the shared folder. The dialog then shows the name of our folder. If the user grants it, that page can change or delete files in the shared folder, and on an admin computer it can replace `app/index.html`. Item 5 of §3 decreases the risk: the app does not let users attach or download files that run as pages. A residual path stays: an HTML file inside a ZIP attachment, or an HTML file from another source, such as email or the web.
4. `localStorage` contains only view settings (filters, board or table, the language of the start screens).

## 5. Known limitations

- **All users can read all data.** The data in the shared folder is not encrypted. Teams with secret tasks need separate shared folders (Q-1).
- **A malicious admin can do everything.** An admin can change the app, the trust root and all roles. The audit log shows the ops of the admin, but an admin with access to `app/` can replace the app.
- **The time is self-reported.** `wallTime` and the HLC come from the author's computer. An op from a computer with a clock far in the future wins the conflicts with concurrent ops (`docs/data-model.md` §4). The integrity view shows most such ops (`future-clock`, `docs/data-model.md` §4), but it cannot prevent the effect.
- **Role changes are by order.** A demoted admin or verifier can backdate ops between the own last op and the role change. A root admin must also revoke the key (`docs/data-model.md` §6, `docs/operations.md` §4.3).
- **The stored folder handle** is readable by other local HTML files (§4, accepted risk).
- **The app file is a supply-chain point.** A changed `app/index.html` can steal passphrases. `app/SHA256SUMS` and `app/VERSION` help an admin check a release. Only admins can write to `app/`.
- **The `file://` storage origin** is shared (§4).
- **XSS** can use the unlocked key (§3).
- **Key loss.** A user who loses the key file or the passphrase cannot write. The admin revokes the old key (**Odvolat klíč**) and approves a new key. For a root admin, see `docs/operations.md` §4.2.
- **Notifications** show only while the app is open (ADR 0013).
