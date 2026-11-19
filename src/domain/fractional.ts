// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Fractional index keys for the order of subtasks (docs/data-model.md §10.2).
// Keys are strings of base-62 digits. They compare by code units ("<"), never with localeCompare.
// A key never ends with the digit "0", so that a key between any 2 different keys exists.

export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const POS_RE = /^[0-9A-Za-z]{0,79}[1-9A-Za-z]$/;
const BASE = DIGITS.length;
const MID = DIGITS[BASE >> 1];

const digit = (k: string, i: number): number => (i < k.length ? DIGITS.indexOf(k[i]) : 0);

/**
 * A key strictly between a and b. a = null means "before the first key",
 * b = null means "after the last key". Throws if a >= b (equal keys: no key exists between them).
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && !(a < b)) throw new Error('no key between equal or unordered keys');
  if (a === null && b === null) return MID;
  let out = '';
  for (let i = 0; ; i++) {
    const da = a === null ? 0 : digit(a, i);
    const db = b === null || i >= b.length ? BASE : digit(b, i);
    if (da === db) {
      out += DIGITS[da];
      continue;
    }
    if (db - da > 1) {
      // A digit between them. Not "0" at the end (it is > da >= 0).
      return out + DIGITS[(da + db) >> 1];
    }
    // db = da + 1: take da and continue with "after the rest of a".
    out += DIGITS[da];
    for (let j = i + 1; ; j++) {
      const d = a === null ? 0 : digit(a, j);
      if (d < BASE - 1) return out + DIGITS[Math.max(d + 1, (d + BASE) >> 1)];
      out += DIGITS[d];
    }
  }
}

/** Maximum key length that the UI makes. A longer key triggers a rebalance (POS_RE permits 80). */
export const MAX_POS_LEN = 40;

/**
 * n keys in order, with even spaces: all keys have the same length L (before the
 * trailing "0" digits are removed), with 1 spare digit for later inserts.
 */
export function spreadKeys(n: number): string[] {
  let len = 1;
  while (BASE ** len <= (n + 1) * BASE) len++;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    // Value i / (n + 1) of the range, as L base-62 digits. BigInt keeps it exact.
    let v = (BigInt(i) * BigInt(BASE) ** BigInt(len)) / BigInt(n + 1);
    let k = '';
    for (let d = 0; d < len; d++) {
      k = DIGITS[Number(v % BigInt(BASE))] + k;
      v /= BigInt(BASE);
    }
    out.push(k.replace(/0+$/, ''));
  }
  return out;
}

/** Sort key of a subtask: (pos, id), by code units. */
export const comparePos = (x: { pos: string; id: string }, y: { pos: string; id: string }): number =>
  x.pos < y.pos ? -1 : x.pos > y.pos ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;

/**
 * The position changes for moving 1 item to index `to` (in the list without the item).
 * `items` must be sorted with comparePos. If the new neighbours have the same pos,
 * no key exists between them: then all items get new keys (a rebalance, data-model §10.2).
 * The UI writes the result as 1 MoveSubtask, or as a Batch of MoveSubtask ops.
 */
export function planMove(items: readonly { id: string; pos: string }[], id: string, to: number): { id: string; pos: string }[] {
  const rest = items.filter((x) => x.id !== id);
  if (rest.length === items.length) throw new Error(`unknown item ${id}`);
  const i = Math.max(0, Math.min(to, rest.length));
  const before = i > 0 ? rest[i - 1].pos : null;
  const after = i < rest.length ? rest[i].pos : null;
  if (before === null || after === null || before < after) {
    const pos = keyBetween(before, after);
    if (pos.length <= MAX_POS_LEN) return [{ id, pos }];
  }
  const order = [...rest.slice(0, i), { id, pos: '' }, ...rest.slice(i)];
  const keys = spreadKeys(order.length);
  return order.map((x, k) => ({ id: x.id, pos: keys[k] })).filter((x) => x.id === id || items.find((y) => y.id === x.id)!.pos !== x.pos);
}
