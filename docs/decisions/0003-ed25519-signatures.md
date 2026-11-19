# 0003. Ed25519 signatures with WebCrypto

- Status: accepted (owner, 2026-11-19). Edge 137 or later is acceptable (Q-3).
- Date: 2026-11-19

## Context

The task says: use ECDSA P-256, unless Ed25519 is verified in current Edge and Chrome.

On 2026-11-19 I tested Chromium 155 on this computer over `file://` with Playwright. `crypto.subtle.generateKey({ name: "Ed25519" })` and `sign` operate. The signature has 64 bytes. Chrome supports Ed25519 in WebCrypto since version 137. Edge uses the same Chromium code. Node 22 also supports Ed25519, so the tests use the same code. `system-vzdelavani` uses Ed25519 too (its ADR 0002).

## Decision

Use Ed25519. The key record has an `alg` field, so a second algorithm can be added later. The app checks Ed25519 support at start and shows a message in Czech if the browser does not support it.

## Consequences

- Signatures are deterministic, so test vectors are fixed values.
- Edge older than 137 cannot run the app.
