// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Task views for the UI. Built in 1 pass over the state (O(number of entities)).

import type { Entity, State } from 'oplog-core';
import type { Status } from './constants';
import { comparePos } from './fractional';
import { dataOf, resolveTag } from './state';

export interface Due {
  at: string;
  allDay: boolean;
}

export interface TaskView {
  id: string;
  title: string;
  description: string;
  status: Status;
  due: Due | null;
  createdAt: string;
  createdBy: string;
  completedAt: string | null;
  completedBy: string | null;
  completeRef: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  postponedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  /** User IDs, sorted by ID. */
  assignees: string[];
  /** Resolved active tags, sorted by tag ID. */
  tags: { id: string; name: string }[];
  /** Active subtasks in their order. */
  subtasks: Entity[];
  subtasksDone: number;
  /** Active attachments and links, active and deleted comments (sorted by creation time). */
  attachments: Entity[];
  links: Entity[];
  comments: Entity[];
  commentCount: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** All tasks (also deleted ones) with their children. */
export function buildTaskViews(state: State): Map<string, TaskView> {
  const d = dataOf(state);
  const out = new Map<string, TaskView>();
  for (const t of Object.values(d.task ?? {})) {
    out.set(t.id, {
      id: t.id,
      title: String(t.title ?? ''),
      description: String(t.description ?? ''),
      status: t.status as Status,
      due: (t.due as Due | null) ?? null,
      createdAt: String(t.createdAt ?? ''),
      createdBy: String(t.createdBy ?? ''),
      completedAt: str(t.completedAt),
      completedBy: str(t.completedBy),
      completeRef: str(t.completeRef),
      verifiedAt: str(t.verifiedAt),
      verifiedBy: str(t.verifiedBy),
      postponedAt: str(t.postponedAt),
      deletedAt: str(t.deletedAt),
      deletedBy: str(t.deletedBy),
      assignees: [],
      tags: [],
      subtasks: [],
      subtasksDone: 0,
      attachments: [],
      links: [],
      comments: [],
      commentCount: 0,
    });
  }
  const of = (e: Entity) => out.get(e.taskId as string);
  for (const a of Object.values(d.assignee ?? {})) if (a.on === true) of(a)?.assignees.push(a.userId as string);
  const tagSeen = new Map<string, Set<string>>();
  for (const tt of Object.values(d.taskTag ?? {})) {
    if (tt.on !== true) continue;
    const v = of(tt);
    const root = resolveTag(state, tt.tagId as string);
    if (!v || !root || root.status !== 'active') continue;
    const seen = tagSeen.get(v.id) ?? new Set<string>();
    tagSeen.set(v.id, seen);
    if (seen.has(root.id)) continue;
    seen.add(root.id);
    v.tags.push({ id: root.id, name: String(root.name) });
  }
  for (const s of Object.values(d.subtask ?? {})) if (s.status === 'active') of(s)?.subtasks.push(s);
  for (const a of Object.values(d.attachment ?? {})) if (a.status === 'active') of(a)?.attachments.push(a);
  for (const l of Object.values(d.link ?? {})) if (l.status === 'active') of(l)?.links.push(l);
  for (const c of Object.values(d.comment ?? {})) of(c)?.comments.push(c);
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  for (const v of out.values()) {
    v.assignees.sort(byId);
    v.tags.sort((a, b) => byId(a.id, b.id));
    v.subtasks.sort((a, b) => comparePos(a as { pos: string; id: string }, b as { pos: string; id: string }));
    v.subtasksDone = v.subtasks.filter((s) => s.done === true).length;
    v.comments.sort((a, b) => byId(String(a.createdAt), String(b.createdAt)) || byId(a.id, b.id));
    v.commentCount = v.comments.filter((c) => c.status === 'active').length;
  }
  return out;
}

/** Due state of a task at a time: overdue, soon (within `dueSoonDays`) or null. */
export function dueState(v: Pick<TaskView, 'due' | 'status'>, now: number, dueSoonDays: number): 'overdue' | 'soon' | null {
  if (!v.due || (v.status !== 'new' && v.status !== 'assigned')) return null;
  const at = Date.parse(v.due.at);
  if (at < now) return 'overdue';
  if (at - now <= dueSoonDays * 24 * 3600_000) return 'soon';
  return null;
}
