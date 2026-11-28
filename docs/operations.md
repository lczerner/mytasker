# Operations

This document is for the maintainer and for technical admins. It describes the build, the release, the installation and the manual procedures that the app cannot do.

The admins use the Czech admin guide for the daily work. It is part of the app (**Příručka správce**, `docs/admin-guide.md`). The users use the Czech user guide (**Nápověda**, `docs/user-guide.md`). If you change a procedure, update the guide and this document together.

## 1. Build and test

Requirements: Node.js 22 or later, Chromium for the build check and the e2e tests, and the repository `oplog-core` in `../oplog-core` at the commit of `.oplog-core-ref` (README, "Quick start").

```sh
make install          # npm ci
make check            # oplog-core check, typecheck, unit + property + simulation tests, build check, SBOM
npm run test:e2e      # browser tests (CHROMIUM=/path/to/chromium)
make demo             # build, then print the URL of the demo mode
```

`make help` lists all targets.

## 2. Release

1. Make sure that the CI of `master` is green, and that the local `master` is clean and up to date (`git switch master && git pull --ff-only`). Then run `make check` and `npm run test:e2e`.
2. If the release has changes for the users, increase `version` in `package.json` first, in a pull request (AGENTS.md §7).
3. Run `make release`. It stops if the code of `../oplog-core` is not clean or not at the pinned commit (`.oplog-core-ref`). The result is in `release/app/`:
   - `index.html`: the app, with all code, styles and guides inside.
   - `LICENSE` and `THIRD-PARTY-NOTICES.md`.
   - `VERSION`: the version and the commit, for example `0.1.0 (a44e002)`.
   - `SHA256SUMS`: the SHA-256 of the files above.
   - `release/mytasker-<version>.zip`: the full installation. It has the folder `Ukoly` with the folder skeleton (`release/create-folders.sh`) and the files above in `app/`. It has no `trust-root.json` and no data.
   - `release/sbom/runtime.cdx.json` and `release/sbom/build.cdx.json`: the SBOMs of this release (`make sbom`, AGENTS.md §7.2). Give them to the admins with the package if they ask for them.
4. If `VERSION` shows `-dirty`, the build used uncommitted changes: a changed tracked file, or an untracked file in a path that the build reads (`src/`, `docs/img/`, `public/`, `index.html` and the config files at the root). Other untracked files do not count. Do not distribute such a package.
5. Attach the archive and the files of `release/app/` to the GitHub release. The admin guide, chapter 2, describes the installation, and chapter 9 describes the update.

`app/index.html` in the shared folder is the supply-chain point of the system (`docs/security-model.md`). Copy the release only from a trusted computer, and compare `SHA256SUMS` before the copy.

## 3. Installation

The admin guide, chapter 2, describes the installation in Czech. Short form:

1. Extract `release/mytasker-<version>.zip` into OneDrive or SharePoint. Or make the folder skeleton: `release/create-folders.sh <root>` (or make the folders by hand: `app`, `roles/ops`, `roles/checkpoints`, `data/ops`, `data/checkpoints`, `data/files`, `enroll`).
2. Without the archive: copy `release/app/*` to `<root>/app/`.
3. Set the OneDrive permissions (`docs/architecture.md` §3).
4. The first admin opens `app/index.html` and clicks **Vytvořit novou instalaci**. The app writes `app/trust-root.json`.
5. Approve a second admin as soon as possible. Then make that admin a second root admin (§4.1).

For a local test without OneDrive: `make test-folder` makes `~/mytasker-test` with the current release.

## 4. Manual procedures for the trust root

`app/trust-root.json` is not an op. The app cannot change it. Only a person with write access to `app/` can change it. The format:

```json
{
  "v": 1,
  "roots": [
    { "userId": "…", "displayName": "…", "keyId": "k…", "alg": "Ed25519", "publicKey": "…", "cutoffs": null }
  ]
}
```

Rules for each change:

- Make a copy of the old file before you change it.
- Keep the old root entries. Do not remove a root entry: the old ops of that key must stay valid.
- After the change, each user must reload the app (F5). The app reads the file again on the next full scan.
- A change of the file changes the fingerprints on the start screen. Tell the users about the change, so that they can compare the fingerprints with you.
- The encrypted cache and the read state of the notifications use a hash of the file as their ID. After the change, each computer reads all ops 1 time again. The old event notifications (comments, assignments) count as read. The state notifications (due, overdue, to verify) show again as unread.
- After the change, each client shows the issue "Kořen důvěry je nečitelný nebo neplatný, nebo se změnil" (`trust-root`) in **Správa → Integrita**. A running client shows it after its next full scan (each 8th poll or the button **↻**), and a client that starts again shows it at once. The browser keeps the known trust root of each folder in IndexedDB (not encrypted: it is public data). At the start, the app gives it to the engine before the cache. Thus the issue stays also after a reload, and also after a rollback of the file to an older version (with an older cache). An admin sees a notice at the top of each page. A user who waits for approval sees a notice in the waiting step. The issue stays until an admin confirms the trust root on that computer:
  1. Open **Správa → Integrita**. The group of the issue shows a table of the root entries: each entry of the new file, and each removed entry, with the change against the known trust root (added, removed, changed, no change), the user ID, the fingerprint and the cutoffs.
  2. Compare each fingerprint out of band, for example by phone or in person. Also check the user IDs, the removed entries and the cutoffs.
  3. If all fingerprints are correct, click **Potvrdit kořen důvěry**. The app saves the confirmed trust root as the known trust root of this computer.
  4. If a fingerprint is not correct, do not confirm. Restore the file from the OneDrive version history and find out who changed it.
- A non-admin client cannot confirm the change. It keeps the issue, but it does not show the integrity view.
- The app writes the known trust root only on the first start in a browser and after a confirmation. Known limit: if 2 tabs of the same browser confirm different trust roots, the last write wins.
- The limits of the detection are in `docs/security-model.md` §4.
- A browser that opens the folder for the first time (or after **Vymazat data aplikace v tomto prohlížeči**) has no known trust root. It takes the current file and shows no issue. Thus tell the users about each change, so that they compare the fingerprints on the start screen.
- If the file is missing, empty, too large (more than 1 MiB) or not valid, a running client keeps the known trust root and shows a `trust-root` issue.
- At the start, the app checks the file first:
  - An empty, damaged, too large or not valid file: the app does not open the shared folder. The start screen "Kořen důvěry je poškozený" asks an admin to repair the file.
  - A missing file: a browser with a known trust root opens the folder with the known copy and shows a `trust-root` issue. A browser with no known trust root offers a new installation only if the folder has no op data (`roles/ops` and `data/ops` are empty). Else it shows the start screen "Kořen důvěry je poškozený".
- To repair the file, restore it from the OneDrive version history. Do not create a new installation.

`test/unit/operations.test.ts` tests the procedures of §4.1 and §4.2 (with a second root admin, and for the only admin), and the `trust-root` issue of a changed or missing file after a reload.

### 4.1 Make a second root admin

Use this after the installation, so that the loss of 1 root key does not stop the administration.

1. The second admin enrolls as a normal user. A root admin approves the request and clicks **Nastavit jako správce**.
2. Find the `userId`, the `keyId` and the `publicKey` of the second admin. Open **Správa → Audit**, select the change "Schválení uživatele" of this admin, and open **Obsah změny (technicky)**. Copy the 3 values exactly.
3. Add a root entry for the second admin to `app/trust-root.json`, with these values and `"cutoffs": null`.
4. Do a full scan (button **↻**) and reload the app. **Správa → Uživatelé** shows "hlavní správce" for the second admin.

### 4.2 Replace a lost or stolen root key

A root key cannot be revoked with an op. A person with write access to `app/` does this. No approval in the app is necessary: the app knows a root key from `app/trust-root.json` alone.

1. Find the last trusted `seq` of the old key in each scope (`roles` and `data`):
   - If another admin can open the app: **Správa → Audit**, filter by the author, and open the detail of the newest trusted change. It shows the order number (`pořadí`).
   - Else: the highest file number in `roles/ops/<old keyId>/` and in `data/ops/<old keyId>/` (for example `0000000017.json` is `seq` 17). For a stolen key, use the highest number that was there before the theft (the OneDrive version history shows when each file came).
2. Set `"cutoffs": { "roles": <seq>, "data": <seq> }` on the root entry of the old key. Do not remove the entry.
3. If the owner of the old key continues as an admin: the owner opens the app, clicks **Použít jiný klíč**, then **Jsem nový uživatel / mám nový počítač**, and creates a new key. The app writes a request file in `enroll/` and shows the fingerprint on the screen **Žádost o přístup**.
   - **Compare the fingerprint before you continue**, also if you are the owner. All users can write to `enroll/`, so a request file with the same name can come from another person. The fingerprint is the characters 2 to 21 of `keyId` in the file, in upper case, in groups of 4 (`docs/architecture.md` §6). If it is different, stop.
   - Copy `keyId` and `publicKey` from that file. Add a root entry with these 2 values, the **same `userId` as the old root entry**, and `"cutoffs": null`. Then delete the request file.
4. Do a full scan (**↻**) and reload the app on each computer. Ops of the old key above the cutoff are now invalid. **Správa → Integrita** lists them. The owner opens the app with the new key: no approval is necessary.
   - Known limit: **Správa → Uživatelé** does not show "odvolán" for a root key with a cutoff in `trust-root.json`. Use the integrity view and the audit to check the result.

This procedure also works if the lost key belonged to the only admin. Then make a second root admin at once (§4.1).

### 4.3 An admin who is not trusted

Role changes apply by order, not by cutoff (`docs/data-model.md` §6.2). An admin who is not trusted can write an op with an old time before the change of the role. Thus a **root admin** must do all steps:

1. **Odebrat práva správce** for that admin (and **Zrušit kontrolu úkolů** if necessary).
2. **Odvolat klíč** for each key of that admin.
3. If the person stays in the team: the person enrolls a new key, and you approve it as a new key for the existing user.
4. Check the newest changes of that admin in the audit, and revert unwanted changes.

A non-root admin must not do this: the admin who is not trusted can then revoke the key of that admin with an old time, and the replay reports an integrity issue.

## 5. Attachment purge

An admin purges an attachment file in the task panel (**Trvale odstranit soubor**, a reason is required). The app writes a `PurgeBlob` op, then deletes `data/files/<sha256>`. All attachments with this hash show "odstraněno". The purge cannot be undone, and a later `AddAttachment` with the same hash is superseded (`docs/data-model.md` §11).

- If the delete fails (for example a OneDrive lock), the app shows a message with the path. Other clients do not open a purged file. Delete the file by hand: the button is gone after the purge.
- The app refuses a new upload of the same content. A computer that did not yet see the `PurgeBlob` op can still write the file again. If the file comes back, delete it by hand.
- OneDrive keeps the deleted file in its recycle bin and version history for some time. For a sensitive file, delete it there too.

## 6. Repair of the op files

The rule: never change or delete an op file. A repair restores the original file.

- **`chain-gap` that stays for more than 1 day, `chain-broken`, `bad-signature`:** an op file is missing or changed. Restore the original version from the OneDrive version history or the OneDrive recycle bin. The integrity view shows the path. After the restore, do a full scan.
- **`fork`:** 2 different ops with the same author and `seq`. The cause is the same key on 2 computers at the same time, or a restored backup of the key folder. The ops after the fork are not applied. Revoke the key (the cutoff is below the fork) and let the user enroll a new key. Do not delete one of the 2 files: other computers can already have applied it.
- **`unknown-file`:** usually a OneDrive conflict copy (the computer name is in the file name). The app ignores it. Check the content, then delete the file.
- **A file of another author under the next number of a user** (ADR 0014): the chain skips such a file. No repair is necessary. Delete the file.

## 7. Backup and restore

- OneDrive keeps a version history and a recycle bin. That covers most accidents.
- Copy the full shared folder to a different safe location 1 time each month. The ops are immutable, so an incremental copy is sufficient.
- To restore a full folder: copy the backup into an empty shared folder. Each client then reads the ops from the start. Ops that the users wrote after the backup are lost, except the ops that are still on their computers in the encrypted cache. The cache does not write ops back to the folder.

## 8. Performance

`docs/performance.md` has the measurements with 5 000 tasks and about 100 000 ops, and the method (`npm run perf`, and `index.html?demo=perf` in the browser). Short form:

- The first start on a new computer reads and checks all ops. This takes about 10 seconds at 100 000 ops on a fast computer, and more on Windows with OneDrive. Later starts use the encrypted cache.
- Make a checkpoint (**Správa → Kontrolní body**) when more than about 2 000 op files are outside checkpoints. A checkpoint replaces many small file reads with 1 file. It does not save the signature checks: the app checks each op in a checkpoint again.
