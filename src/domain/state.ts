// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Read functions on the replayed state. Pure; used by the replay and by the UI.

import type { Entity, OpMeta, State } from 'oplog-core';
import { DATA, DEFAULT_SETTINGS, ROLES, type Settings } from './constants';

export const rolesOf = (s: State) => s.scopes[ROLES] ?? {};
export const dataOf = (s: State) => s.scopes[DATA] ?? {};

export const userOf = (s: State, userId: string): Entity | undefined => rolesOf(s).user?.[userId];
export const userIsActive = (s: State, userId: string): boolean => userOf(s, userId)?.status === 'active';
export const userIsAdmin = (s: State, userId: string): boolean => {
  const u = userOf(s, userId);
  return u?.status === 'active' && u.role === 'admin';
};
export const userIsVerifier = (s: State, userId: string): boolean => {
  const u = userOf(s, userId);
  return u?.status === 'active' && u.verifier === true;
};

/** The settings at this point of the order, with defaults. */
export function settingsOf(s: State): Settings {
  const t = rolesOf(s).setting ?? {};
  const v = <K extends keyof Settings>(k: K): Settings[K] => (t[k]?.value ?? DEFAULT_SETTINGS[k]) as Settings[K];
  return { dueSoonDays: v('dueSoonDays'), pollSeconds: v('pollSeconds'), maxAttachmentMB: v('maxAttachmentMB'), defaultTags: v('defaultTags') };
}

/**
 * Follows the mergedInto chain of a tag to its end. Stops at a tag that it saw
 * before (a cycle cannot exist, but this is a second protection, data-model §10.3).
 */
export function resolveTag(s: State, tagId: string): Entity | null {
  const tags = dataOf(s).tag ?? {};
  let t = tags[tagId];
  const seen = new Set<string>();
  while (t && t.status === 'merged' && typeof t.mergedInto === 'string' && !seen.has(t.id)) {
    seen.add(t.id);
    const next = tags[t.mergedInto];
    if (!next) break;
    t = next;
  }
  return t ?? null;
}

/** True if the mergedInto chain from this tag has a cycle. */
export function hasMergeCycle(s: State, tagId: string): boolean {
  const tags = dataOf(s).tag ?? {};
  const seen = new Set<string>();
  let t = tags[tagId];
  while (t && t.status === 'merged' && typeof t.mergedInto === 'string') {
    if (seen.has(t.id)) return true;
    seen.add(t.id);
    t = tags[t.mergedInto];
  }
  return false;
}

/** The creation order of a tag: the position of its op in the total order, as a string. */
export const tagOrder = (op: OpMeta): string =>
  `${String(op.hlc.t).padStart(16, '0')}.${String(op.hlc.c).padStart(10, '0')}.${op.authorKeyId}.${String(op.seq).padStart(10, '0')}.${String(op.item).padStart(4, '0')}`;

/** The tag links of a task (on or off). Uses the composite ID "<taskId>/<tagId>". */
export function taskTagsOf(s: State, taskId: string): Entity[] {
  const d = dataOf(s);
  const links = d.taskTag ?? {};
  const out: Entity[] = [];
  for (const tagId of Object.keys(d.tag ?? {})) {
    const tt = links[`${taskId}/${tagId}`];
    // Check the fields too: the composite key alone must never decide (review finding).
    if (tt && tt.taskId === taskId && tt.tagId === tagId) out.push(tt);
  }
  return out;
}
