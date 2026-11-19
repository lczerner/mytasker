// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Status state machine (docs/data-model.md §9). This table is DATA.
// Change it only with the owner's approval. test/unit/status.test.ts checks the full matrix.

import type { Status } from './constants';

export const STATUS_OPS = ['PostponeTask', 'ResumeTask', 'CompleteTask', 'VerifyTask', 'ReturnTask', 'ReopenTask', 'DeleteTask', 'RestoreTask'] as const;
export type StatusOp = (typeof STATUS_OPS)[number];

/**
 * - `assignedOrNew`: `assigned` if the task has assignees, else `new`.
 * - `beforeDelete`: the status before the deletion (`statusBeforeDelete`).
 */
export type Target = Status | 'assignedOrNew' | 'beforeDelete';

export interface Transition {
  from: readonly Status[];
  to: Target;
  /**
   * A guard that depends on the status (data-model §6.1). If it fails, the op is
   * superseded, not rejected. `admin` = the author is an admin.
   */
  guard?: (from: Status, who: { admin: boolean }) => string | null;
}

const ALL_BUT_DELETED: readonly Status[] = ['new', 'assigned', 'postponed', 'done', 'verified'];

export const TRANSITIONS: Record<StatusOp, Transition> = {
  PostponeTask: { from: ['new', 'assigned'], to: 'postponed' },
  ResumeTask: { from: ['postponed'], to: 'assignedOrNew' },
  CompleteTask: { from: ['new', 'assigned'], to: 'done' },
  VerifyTask: { from: ['done'], to: 'verified' },
  ReturnTask: { from: ['done'], to: 'assignedOrNew' },
  ReopenTask: { from: ['verified'], to: 'assignedOrNew' },
  DeleteTask: {
    from: ALL_BUT_DELETED,
    to: 'deleted',
    guard: (from, who) => (from === 'verified' && !who.admin ? 'only an admin can delete a verified task' : null),
  },
  RestoreTask: { from: ['deleted'], to: 'beforeDelete' },
};

export const isStatusOp = (t: string): t is StatusOp => (STATUS_OPS as readonly string[]).includes(t);

/** The status after a transition. */
export function targetStatus(t: Transition, task: Record<string, unknown>): Status {
  if (t.to === 'assignedOrNew') return Number(task.assigneeCount ?? 0) > 0 ? 'assigned' : 'new';
  if (t.to === 'beforeDelete') return (task.statusBeforeDelete as Status | null) ?? 'new';
  return t.to;
}

/**
 * Checks a status op against the actual status (data-model §9.1).
 * Returns null if the transition is valid now, else the reason for "superseded".
 */
export function checkTransition(op: StatusOp, actual: Status, who: { admin: boolean }): string | null {
  const t = TRANSITIONS[op];
  if (!t.from.includes(actual)) return `the status changed to ${actual}`;
  return t.guard?.(actual, who) ?? null;
}
