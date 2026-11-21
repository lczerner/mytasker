# 0005. RFC 8785 (JCS) canonical JSON

- Status: accepted (same as in the earlier app of the owner)
- Date: 2026-11-19

## Decision

The signature and `prevHash` use the canonical JSON of RFC 8785: sorted keys, no spaces, the ECMAScript number format. Payloads contain no floating-point numbers. Times are ISO strings. Fractional indexes are strings.

## Consequences

The code is in `oplog-core`. Tests use the vectors of RFC 8785.
