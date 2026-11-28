// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Notifications of the current user, computed from the state and the audit log
// (docs/data-model.md §12). The time is a parameter, so tests can set it.

import type { AuditEntry, State } from 'oplog-core';
import { BATCH } from 'oplog-core';
import { itemRef } from './catalog';
import { settingsOf, userIsAdmin, userIsVerifier } from './state';
import { dueState, type TaskView } from './view';

export type NotificationKind = 'due' | 'overdue' | 'assigned' | 'comment' | 'mention' | 'returned' | 'superseded' | 'verify';

export interface Notification {
  /** Stable ID. The read state is kept by this ID. */
  id: string;
  kind: NotificationKind;
  taskId: string | null;
  /** The time of the event (op wallTime, or the due time). */
  at: string;
  /** The user who caused it, if any. */
  by: string | null;
  /** Extra text, for example the reason of a superseded op. */
  detail?: string;
}

export interface NotificationInput {
  state: State;
  audit: readonly AuditEntry[];
  views: ReadonlyMap<string, TaskView>;
  me: string;
  now: number;
}

/** The items of an audit entry with their notification reference (itemRef: author key, opId and index). */
function items(a: AuditEntry): { ref: string; type: string; payload: Record<string, any>; index: number }[] {
  if (a.type === BATCH && Array.isArray(a.payload.ops)) return (a.payload.ops as { type: string; payload: Record<string, any> }[]).map((it, i) => ({ ref: itemRef(a.authorKeyId, a.opId, i), type: it.type, payload: it.payload, index: i }));
  return [{ ref: itemRef(a.authorKeyId, a.opId, null), type: a.type, payload: a.payload, index: 0 }];
}

/** True if this item had an effect (the op is applied and the item is not in the notes). */
const itemApplied = (a: AuditEntry, index: number): boolean => a.status === 'applied' && !a.notes.some((n) => n.item === index);

export function computeNotifications({ state, audit, views, me, now }: NotificationInput): Notification[] {
  const out: Notification[] = [];
  const { dueSoonDays } = settingsOf(state);
  const isVerifier = userIsVerifier(state, me) || userIsAdmin(state, me);
  const mine = (v: TaskView) => (v.assignees.length ? v.assignees.includes(me) : v.createdBy === me);

  for (const v of views.values()) {
    const ds = dueState(v, now, dueSoonDays);
    if (ds && mine(v)) out.push({ id: `${ds}:${v.id}:${v.due!.at}`, kind: ds === 'soon' ? 'due' : 'overdue', taskId: v.id, at: v.due!.at, by: null });
    if (isVerifier && v.status === 'done' && v.completeRef) out.push({ id: `verify:${v.completedBy}/${v.completeRef}`, kind: 'verify', taskId: v.id, at: v.completedAt ?? '', by: v.completedBy });
  }

  for (const a of audit) {
    if (a.userId === me) {
      if (a.status === 'superseded') out.push({ id: `superseded:${itemRef(a.authorKeyId, a.opId, null)}`, kind: 'superseded', taskId: taskOf(a.payload), at: a.wallTime, by: null, detail: a.reason });
      else for (const n of a.notes) if (n.status === 'superseded') out.push({ id: `superseded:${itemRef(a.authorKeyId, a.opId, a.type === BATCH ? n.item : null)}`, kind: 'superseded', taskId: taskOf(items(a)[n.item]?.payload ?? {}), at: a.wallTime, by: null, detail: n.reason });
      continue;
    }
    if (a.status !== 'applied') continue;
    for (const it of items(a)) {
      if (!itemApplied(a, it.index)) continue;
      const p = it.payload;
      if (it.type === 'AddAssignee' && p.userId === me) out.push({ id: `assigned:${it.ref}`, kind: 'assigned', taskId: p.taskId, at: a.wallTime, by: a.userId });
      else if (it.type === 'AddComment') {
        const v = views.get(p.taskId);
        if (Array.isArray(p.mentions) && p.mentions.includes(me)) out.push({ id: `mention:${it.ref}`, kind: 'mention', taskId: p.taskId, at: a.wallTime, by: a.userId });
        else if (v && (v.assignees.includes(me) || v.createdBy === me)) out.push({ id: `comment:${it.ref}`, kind: 'comment', taskId: p.taskId, at: a.wallTime, by: a.userId });
      } else if (it.type === 'ReturnTask') {
        const v = views.get(p.id);
        const completer = a.writes.find((w) => w.e === 'task' && w.id === p.id && w.f === 'completedBy')?.before;
        if (v && (v.assignees.includes(me) || completer === me)) out.push({ id: `returned:${it.ref}`, kind: 'returned', taskId: p.id, at: a.wallTime, by: a.userId, detail: String(p.text ?? '') });
      }
    }
  }
  return out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : x.id < y.id ? -1 : 1));
}

function taskOf(p: Record<string, any>): string | null {
  if (typeof p.taskId === 'string') return p.taskId;
  if (typeof p.id === 'string') return p.id;
  return null;
}

/**
 * Unread notifications. `read` holds the IDs that the user marked as read.
 * Events before `baseline` (the first start of the app for this user) count as read.
 * Due, overdue and verify notifications are states, not events: they stay unread until marked.
 */
export function unread(list: readonly Notification[], read: ReadonlySet<string>, baseline: string): Notification[] {
  return list.filter((n) => !read.has(n.id) && (n.kind === 'due' || n.kind === 'overdue' || n.kind === 'verify' || n.at >= baseline));
}

/** The read state of the notifications of 1 user (stored locally, encrypted). */
export interface ReadState {
  /** Events before this time count as read: the first start of the app, later moved by markRead. */
  baseline: string;
  /** The notifications that the user marked as read, with their time, the oldest mark first. */
  read: { id: string; at: string }[];
}

/** The read state keeps at most this number of entries (the oldest go first). */
export const READ_MAX = 2000;

/** True for a notification that is an event (it has a time and counts against the baseline). */
const isEvent = (kind: NotificationKind) => kind !== 'due' && kind !== 'overdue' && kind !== 'verify';

/**
 * The read state after a load. `stored` undefined means "no record": the first start, so the
 * baseline is now. An invalid record also starts again. The caller must not call this after a load
 * error: then it keeps the stored record and does not save.
 */
export function initialReadState(stored: unknown, now: number): { state: ReadState; save: boolean } {
  const s = stored as Partial<ReadState> | undefined;
  const okEntry = (x: unknown) => !!x && typeof (x as { id: unknown }).id === 'string' && typeof (x as { at: unknown }).at === 'string';
  if (s && typeof s.baseline === 'string' && Array.isArray(s.read) && s.read.every(okEntry)) return { state: { baseline: s.baseline, read: s.read }, save: false };
  return { state: { baseline: new Date(now).toISOString(), read: [] }, save: true };
}

/**
 * Marks notifications as read. An entry is not removed when its notification leaves the list,
 * because the same ID can come back (for example a returned task is overdue again).
 * Above `max` entries the oldest go. The baseline then moves past the time of each removed event,
 * so that a removed event stays read. New entries are added in time order (oldest first).
 */
export function markRead(rs: ReadState, items: readonly Pick<Notification, 'id' | 'at' | 'kind'>[], max = READ_MAX): ReadState {
  const have = new Set(rs.read.map((x) => x.id));
  const add: { id: string; at: string; kind: NotificationKind }[] = [];
  for (const n of [...items].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) {
    if (have.has(n.id)) continue;
    have.add(n.id);
    add.push(n);
  }
  if (!add.length) return rs;
  const kinds = new Map(add.map((n) => [n.id, n.kind]));
  const merged = [...rs.read, ...add.map(({ id, at }) => ({ id, at }))];
  if (merged.length <= max) return { baseline: rs.baseline, read: merged };
  const removed = merged.slice(0, merged.length - max);
  let baseline = rs.baseline;
  for (const r of removed) {
    // An entry from an older version has no kind here: the ID prefix is the kind.
    const kind = kinds.get(r.id) ?? (r.id.split(':')[0] as NotificationKind);
    if (!isEvent(kind)) continue;
    const after = new Date(Date.parse(r.at) + 1).toISOString();
    if (Number.isFinite(Date.parse(r.at)) && after > baseline) baseline = after;
  }
  return { baseline, read: merged.slice(merged.length - max) };
}
