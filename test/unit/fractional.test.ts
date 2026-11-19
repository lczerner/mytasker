// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import fc from 'fast-check';
import { comparePos, keyBetween, planMove, POS_RE, spreadKeys } from '../../src/domain';

const apply = (items: { id: string; pos: string }[], changes: { id: string; pos: string }[]) =>
  items.map((x) => changes.find((c) => c.id === x.id) ?? x).sort(comparePos).map((x) => x.id);

describe('fractional index', () => {
  it('keyBetween gives a valid key strictly between any 2 different keys', () => {
    const key = fc.stringMatching(/^[0-9A-Za-z]{0,6}[1-9A-Za-z]$/);
    fc.assert(
      fc.property(key, key, (a, b) => {
        if (a === b) return;
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const k = keyBetween(lo, hi);
        expect(lo < k && k < hi).toBe(true);
        expect(POS_RE.test(k)).toBe(true);
        expect(POS_RE.test(keyBetween(null, lo)) && keyBetween(null, lo) < lo).toBe(true);
        expect(POS_RE.test(keyBetween(hi, null)) && keyBetween(hi, null) > hi).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('planMove moves 1 item with 1 new key', () => {
    const [a, b, c] = spreadKeys(3);
    const items = [{ id: 'x', pos: a }, { id: 'y', pos: b }, { id: 'z', pos: c }];
    const ch = planMove(items, 'z', 0);
    expect(ch).toHaveLength(1);
    expect(apply(items, ch)).toEqual(['z', 'x', 'y']);
  });

  it('planMove rebalances when the neighbours have the same key', () => {
    const items = [{ id: 'a', pos: 'V' }, { id: 'b', pos: 'V' }, { id: 'c', pos: 'k' }];
    const ch = planMove(items, 'c', 1);
    expect(ch.length).toBeGreaterThan(1);
    expect(apply(items, ch)).toEqual(['a', 'c', 'b']);
    expect(new Set(ch.map((x) => x.pos)).size).toBe(ch.length);
  });
});
