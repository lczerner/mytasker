// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The read state of the notifications: first start, merge and limit.
import { initialReadState, markRead, unread, type Notification, type ReadState } from '../../src/domain/notifications';

const NOW = Date.parse('2026-11-19T10:00:00Z');

describe('initialReadState', () => {
  it('starts with baseline = now and saves, when no record exists', () => {
    expect(initialReadState(undefined, NOW)).toEqual({ state: { baseline: '2026-11-19T10:00:00.000Z', read: [] }, save: true });
  });
  it('keeps a valid stored record and does not save it again', () => {
    const rs = { baseline: '2026-01-01T00:00:00.000Z', read: [{ id: 'a', at: '2026-01-01T00:00:00.000Z' }] };
    expect(initialReadState(rs, NOW)).toEqual({ state: rs, save: false });
  });
  it('starts again for an invalid record', () => {
    for (const bad of [null, 5, {}, { baseline: 1, read: [] }, { baseline: 'x', read: [1] }, { baseline: 'x', read: ['a'] }]) expect(initialReadState(bad, NOW).save).toBe(true);
  });
});

describe('markRead', () => {
  const ev = (id: string, at: string): Notification => ({ id, kind: 'comment', taskId: 't', at, by: 'u' });
  const rs: ReadState = { baseline: 'b', read: [{ id: 'a', at: '2026-01-01T00:00:00.000Z' }] };
  it('adds new entries once, in time order, and returns the same object when nothing changes', () => {
    const r = markRead(rs, [ev('c', '2026-03-01T00:00:00.000Z'), ev('b', '2026-02-01T00:00:00.000Z'), ev('c', '2026-03-01T00:00:00.000Z'), ev('a', '2026-01-01T00:00:00.000Z')]);
    expect(r.read.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(markRead(rs, [ev('a', '2026-01-01T00:00:00.000Z')])).toBe(rs);
  });
  it('a removed event stays read: the baseline moves past it', () => {
    const base: ReadState = { baseline: '2025-01-01T00:00:00.000Z', read: [] };
    const all = Array.from({ length: 10 }, (_, i) => ev(`comment:${i}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`));
    let s = base;
    for (const n of all) s = markRead(s, [n], 4);
    expect(s.read.length).toBe(4);
    expect(unread(all, new Set(s.read.map((x) => x.id)), s.baseline)).toEqual([]);
    // A new event after that is still unread.
    const late = ev('comment:late', '2026-02-01T00:00:00.000Z');
    expect(unread([late], new Set(s.read.map((x) => x.id)), s.baseline)).toEqual([late]);
  });
  it('"all read" with more unread items than the limit leaves nothing unread', () => {
    const all = Array.from({ length: 10 }, (_, i) => ev(`comment:${i}`, `2026-01-${String(10 - i).padStart(2, '0')}T00:00:00.000Z`));
    const s = markRead({ baseline: '2025-01-01T00:00:00.000Z', read: [] }, all, 3);
    expect(unread(all, new Set(s.read.map((x) => x.id)), s.baseline)).toEqual([]);
  });
  it('a read notification that leaves the list and comes back stays read', () => {
    const n: Notification = { id: 'overdue:t1:2026-11-18T22:59:00.000Z', kind: 'overdue', taskId: 't1', at: '2026-11-18T22:59:00.000Z', by: null };
    let s: ReadState = { baseline: '2026-01-01T00:00:00.000Z', read: [] };
    s = markRead(s, [n]);
    // The task is done (no notification), then other notifications are read, then the task is returned.
    s = markRead(s, [ev('comment:x', '2026-11-19T00:00:00.000Z')]);
    expect(unread([n], new Set(s.read.map((x) => x.id)), s.baseline)).toEqual([]);
  });
});
