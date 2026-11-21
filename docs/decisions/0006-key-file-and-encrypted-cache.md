# 0006. Passphrase-wrapped key file and encrypted local cache

- Status: accepted (same as in the earlier app of the owner)
- Date: 2026-11-19

## Context

On 2026-11-19 I tested Chromium 155: all `file://` pages share 1 storage origin (`file://`). A page in a different folder read the `localStorage` value of the first page. Thus any local HTML file can read the IndexedDB data of this app.

## Decision

1. The private key is in a key file in a personal folder, never in the shared folder. AES-256-GCM wraps the PKCS#8 key. The wrapping key comes from the passphrase: PBKDF2-SHA256, 600 000 iterations, a random salt.
2. At unlock, the key becomes a non-extractable `CryptoKey` in the memory of the page.
3. A random AES-256-GCM key encrypts the local cache (verified ops and the read state of notifications, never the replayed state). The passphrase-derived key wraps it. An optional copy of the wrapped private key in IndexedDB is permitted, because it is also wrapped.
4. `localStorage` keeps only data that is not secret: the last filter and the view mode.
5. The folder handle is stored in IndexedDB. The owner accepts the risk (Q-22, `docs/security-model.md` §4).

## Consequences

- Another local HTML page cannot get the signing key or read the cache.
- The data in the shared folder is not encrypted. All users and their computers can read it (Q-1).
- If a user forgets the passphrase, the admin enrolls a new key. The cache is rebuilt from the shared folder. For a root admin, see `docs/architecture.md` §6.1.
- Any local HTML file can read the stored folder handle and ask for write access to the shared folder (accepted risk, Q-22).
