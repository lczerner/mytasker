// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The Domain of mytasker for oplog-core: scopes, catalogue, authorize, derived rules.

import { BATCH, type AppliedWrite, type AuthResult, type Cutoff, type Domain, type EffectCtx, type OpItem, type RemoveResult, type State, type Write } from 'oplog-core';
import { CATALOG } from './catalog';
import { DATA, ROLES, SCOPES, type Status } from './constants';
import { conditionFor, PERMISSIONS } from './permissions';
import { hasMergeCycle, rolesOf, userIsAdmin, userIsVerifier } from './state';

/**
 * authorize(op item, state at that point) → ok | reason. The only permission gate.
 * Checks only rules that do not depend on the task status (data-model §6.1).
 */
export function authorize(item: OpItem, ctx: EffectCtx): AuthResult {
  if (item.type === BATCH) return { ok: false, reason: 'a Batch is not an item' };
  const rule = PERMISSIONS[item.type];
  if (!rule) return { ok: false, reason: `unknown op type ${item.type}` };
  const userId = ctx.op.userId;
  const who = { userId, admin: userIsAdmin(ctx.state, userId), verifier: userIsVerifier(ctx.state, userId) };
  const cond = conditionFor(rule, who);
  if (cond === null) return { ok: false, reason: `role may not issue ${item.type}` };
  if (cond === 'ownTask') {
    const task = ctx.get('task', item.payload.id);
    if (task && task.createdBy !== userId) return { ok: false, reason: 'only the creator or an admin can do this' };
  }
  if (cond === 'ownComment') {
    const c = ctx.get('comment', item.payload.id);
    if (c && c.createdBy !== userId) return { ok: false, reason: 'only the author or an admin can do this' };
  }
  return { ok: true };
}

/** Task IDs that writes touch: task fields and assignee links. */
function touchedTasks(writes: AppliedWrite[], ctx: EffectCtx): string[] {
  const ids = new Set<string>();
  for (const w of writes) {
    if (w.e === 'task') ids.add(w.id);
    else if (w.e === 'assignee') {
      const a = ctx.get('assignee', w.id);
      if (a) ids.add(a.taskId as string);
    }
  }
  return [...ids];
}

/**
 * Derived rules (data-model §9), after each item:
 * 0. `assigneeCount` = number of assignees with on = true (counted from the changes).
 * 1. Status new/assigned follows the number of assignees.
 * 2. Status new/assigned/postponed: no completion or verification fields.
 * 3. Status done: no verification fields.
 */
export function normalize(writes: AppliedWrite[], ctx: EffectCtx): Write[] {
  const out: Write[] = [];
  const delta = new Map<string, number>();
  for (const w of writes)
    if (w.e === 'assignee' && w.f === 'on') {
      const d = (w.v === true ? 1 : 0) - (w.before === true ? 1 : 0);
      if (d) {
        const taskId = ctx.get('assignee', w.id)!.taskId as string;
        delta.set(taskId, (delta.get(taskId) ?? 0) + d);
      }
    }
  for (const id of touchedTasks(writes, ctx)) {
    const t = ctx.get('task', id);
    if (!t) continue;
    const put = (f: string, v: unknown) => {
      if ((t[f] ?? null) !== v) out.push({ e: 'task', id, f, v });
    };
    const count = Number(t.assigneeCount ?? 0) + (delta.get(id) ?? 0);
    put('assigneeCount', count);
    const st = t.status as Status;
    if (st === 'new' || st === 'assigned') put('status', count > 0 ? 'assigned' : 'new');
    if (st === 'new' || st === 'assigned' || st === 'postponed') for (const f of ['completedAt', 'completedBy', 'completeRef', 'verifiedAt', 'verifiedBy']) put(f, null);
    if (st === 'done') for (const f of ['verifiedAt', 'verifiedBy']) put(f, null);
  }
  return out;
}

/** A tag merge must not make a cycle (data-model §10.3). Superseded if it does. */
export function checkState(writes: AppliedWrite[], ctx: EffectCtx): string | null {
  for (const w of writes) if (w.e === 'tag' && (w.f === 'mergedInto' || w.f === 'status') && hasMergeCycle(ctx.state, w.id)) return 'the tag merge would make a cycle';
  return null;
}

/** Writes that remove an entity, for a Revert of the op that created it (data-model §8). */
export function removeWrites(e: string, id: string, ctx: EffectCtx): RemoveResult {
  const ent = ctx.get(e, id);
  switch (e) {
    case 'task':
      if (!ent || ent.status === 'deleted') return { superseded: 'the task is deleted already' };
      return {
        writes: [
          { e, id, f: 'status', v: 'deleted' },
          { e, id, f: 'statusBeforeDelete', v: ent.status },
          { e, id, f: 'deletedAt', v: ctx.op.wallTime },
          { e, id, f: 'deletedBy', v: ctx.op.userId },
        ],
        computed: ['statusBeforeDelete', 'deletedAt', 'deletedBy'],
      };
    case 'comment':
    case 'tag':
      return { writes: [{ e, id, f: 'status', v: 'deleted' }], computed: [] };
    case 'subtask':
    case 'attachment':
    case 'link':
      return { writes: [{ e, id, f: 'status', v: 'removed' }], computed: [] };
    case 'assignee':
    case 'taskTag':
      return { writes: [{ e, id, f: 'on', v: false }], computed: [] };
    case 'setting':
      return { writes: [{ e, id, f: 'value', v: null }], computed: [] };
    default:
      return { writes: [], computed: [] };
  }
}

export const domain: Domain = {
  scopeDir: (s) => ((SCOPES as readonly string[]).includes(s) ? s : null),
  scopeFromDir: (d) => ((SCOPES as readonly string[]).includes(d) ? d : null),
  async discoverScopes(storage) {
    const missing: string[] = [];
    const unknown: { path: string; detail: string }[] = [];
    for (const d of SCOPES) {
      const l = await storage.list(d);
      if (l === null) missing.push(d);
      else for (const x of l) if (!['ops', 'checkpoints', ...(d === DATA ? ['files'] : [])].includes(x.name)) unknown.push({ path: `${d}/${x.name}`, detail: 'unexpected entry' });
    }
    return { scopes: [...SCOPES], missing, unknown };
  },
  catalog: CATALOG,
  rootState(tr) {
    const state: State = { scopes: { [ROLES]: { user: {}, key: {}, setting: {} }, [DATA]: {} } };
    const r = state.scopes[ROLES];
    for (const k of tr?.roots ?? []) {
      r.user[k.userId] = { id: k.userId, displayName: k.displayName, role: 'admin', verifier: false, status: 'active', root: true };
      r.key[k.keyId] = { id: k.keyId, userId: k.userId, alg: 'Ed25519', publicKey: k.publicKey, cutoff: null, root: true };
    }
    return state;
  },
  keyOwner(state, keyId) {
    const k = rolesOf(state).key?.[keyId];
    return k ? (k.userId as string) : null;
  },
  keysIn(it) {
    if ((it.type === 'GrantUser' || it.type === 'AddKey') && typeof it.payload.keyId === 'string' && typeof it.payload.publicKey === 'string')
      return [{ keyId: it.payload.keyId, publicKey: it.payload.publicKey }];
    return [];
  },
  revocations(state) {
    const m = new Map<string, Cutoff>();
    for (const k of Object.values(rolesOf(state).key ?? {})) if (k.cutoff) m.set(k.id, k.cutoff as Cutoff);
    return m;
  },
  isRevocation: (it) => it.type === 'RevokeKey' || it.type === 'RemoveUser',
  isAdmin: userIsAdmin,
  isDerived: (e, f) => e === 'task' && f === 'assigneeCount',
  authorize,
  normalize,
  checkState,
  removeWrites,
};

