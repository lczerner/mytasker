// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Op catalogue (docs/data-model.md §5).
//
// Each op type has: the scopes, a payload schema, `check` (rules without state),
// `effects()` (a pure function: payload + state → writes, noEffect or superseded)
// and `revertible`. To add an op type, follow the checklist in AGENTS.md.

import type { EffectCtx, EffectResult, Entity, FieldType, OpDef, Schema, Write } from 'oplog-core';
import { DATA, LIMITS, MAX_DEFAULT_TAGS, ROLES, SETTING_RANGES, USER_ROLES, type Status } from './constants';
import { POS_RE } from './fractional';
import { checkTransition, targetStatus, TRANSITIONS, type StatusOp } from './status';
import { resolveTag, settingsOf, tagOrder, taskTagsOf, userIsAdmin } from './state';
import { isBlockedFileName, normalizeTagName } from './text';

// ---- Field types -------------------------------------------------------------------------

const title: FieldType = { text: LIMITS.title, min: 1 };
const description: FieldType = { text: LIMITS.description, multiline: true };
const due: FieldType = { object: { at: 'iso', allDay: 'bool' }, nullable: true };
const pos: FieldType = 'str';
const urlType: FieldType = { url: ['http:', 'https:', 'mailto:'], max: LIMITS.url };
const commentText: FieldType = { text: LIMITS.comment, multiline: true, min: 1 };
const mentions: FieldType = { list: 'id', max: LIMITS.mentions };
const cutoff: FieldType = { object: { roles: 'int', data: 'int' } };

// ---- Helpers -----------------------------------------------------------------------------

const ok = (writes: Write[]): EffectResult => (writes.length ? { writes } : { noEffect: 'no change' });
const superseded = (reason: string): EffectResult => ({ superseded: reason });
const set = (e: string, id: string, fields: Record<string, unknown>): Write[] => Object.entries(fields).map(([f, v]) => ({ e, id, f, v }));
/** Writes only the fields whose value is different from the entity. */
const changes = (e: string, ent: Entity, fields: Record<string, unknown>): Write[] =>
  Object.entries(fields)
    .filter(([f, v]) => JSON.stringify(ent[f] ?? null) !== JSON.stringify(v ?? null))
    .map(([f, v]) => ({ e, id: ent.id, f, v }));

const posCheck = (p: Record<string, unknown>) => (typeof p.pos === 'string' && POS_RE.test(p.pos) ? null : 'pos: fractional index expected');
const nonNegative = (p: Record<string, unknown>) => (Number(p.size) >= 0 ? null : 'size: must not be negative');

/**
 * The task of an op on task content. Superseded if the task does not exist or is
 * deleted, and (unless allowVerified) if it is verified (read-only, Q-6).
 */
function liveTask(ctx: EffectCtx, taskId: string, allowVerified = false): Entity | string {
  const t = ctx.get('task', taskId);
  if (!t) return 'the task does not exist';
  if (t.status === 'deleted') return 'the task is deleted';
  if (t.status === 'verified' && !allowVerified) return 'the task is verified (read-only)';
  return t;
}

/** A child entity (subtask, link, attachment, comment) and its live task. */
function liveChild(ctx: EffectCtx, e: string, id: string, allowVerified = false): { ent: Entity; task: Entity } | string {
  const ent = ctx.get(e, id);
  if (!ent) return `the ${e} does not exist`;
  if (ent.status === 'removed' || ent.status === 'deleted') return `the ${e} is removed`;
  const task = liveTask(ctx, ent.taskId as string, allowVerified);
  return typeof task === 'string' ? task : { ent, task };
}

const exists = (ctx: EffectCtx, e: string, id: string): boolean => ctx.get(e, id) !== undefined;

/** Reference of the current op item: "<opId>" for a plain op, "<opId>/<index>" for a Batch item (data-model §12). */
export const opRef = (ctx: EffectCtx): string => (ctx.op.envType === 'Batch' ? `${ctx.op.opId}/${ctx.op.item}` : ctx.op.opId);

/**
 * Fields that are part of a composite key ("<taskId>/<userId>", "<taskId>/<tagId>").
 * They must not contain "/", else 2 different pairs can give the same key.
 */
const KEY_FIELDS = ['id', 'taskId', 'tagId', 'userId', 'into'];
export function slashCheck(p: Record<string, unknown>): string | null {
  for (const f of KEY_FIELDS) if (typeof p[f] === 'string' && (p[f] as string).includes('/')) return `${f}: "/" is not permitted`;
  return null;
}

// ---- Status ops ---------------------------------------------------------------------------

function statusOp(op: StatusOp, extra: Schema, more?: (p: Record<string, any>, task: Entity, ctx: EffectCtx, to: Status) => Write[] | string): OpDef {
  const t = TRANSITIONS[op];
  return {
    scopes: [DATA],
    schema: { id: 'id', from: { enum: t.from }, ...extra },
    effects(p, ctx) {
      const task = ctx.get('task', p.id);
      if (!task) return superseded('the task does not exist');
      const actual = task.status as Status;
      const bad = checkTransition(op, actual, { admin: userIsAdmin(ctx.state, ctx.op.userId) });
      if (bad) return superseded(bad);
      const to = targetStatus(t, task);
      const w = more ? more(p, task, ctx, to) : [];
      if (typeof w === 'string') return superseded(w);
      return ok([{ e: 'task', id: p.id, f: 'status', v: to }, ...w]);
    },
    revertible: true,
  };
}

const STATUS_DEFS: Record<StatusOp, OpDef> = {
  PostponeTask: statusOp('PostponeTask', {}, (p, _t, ctx) => set('task', p.id, { due: null, postponedAt: ctx.op.wallTime, postponedBy: ctx.op.userId })),
  ResumeTask: statusOp('ResumeTask', { 'due?': due }, (p) => (p.due !== undefined ? set('task', p.id, { due: p.due }) : [])),
  CompleteTask: statusOp('CompleteTask', { 'completedAt?': 'iso' }, (p, _t, ctx) => set('task', p.id, { completedAt: p.completedAt ?? ctx.op.wallTime, completedBy: ctx.op.userId, completeRef: opRef(ctx) })),
  VerifyTask: statusOp('VerifyTask', {}, (p, _t, ctx) => set('task', p.id, { verifiedAt: ctx.op.wallTime, verifiedBy: ctx.op.userId })),
  ReturnTask: statusOp('ReturnTask', { commentId: 'id', text: commentText }, (p, _t, ctx) => {
    if (exists(ctx, 'comment', p.commentId)) return 'the comment ID exists already';
    return [
      ...set('task', p.id, { completedAt: null, completedBy: null, completeRef: null }),
      ...set('comment', p.commentId, { taskId: p.id, text: p.text, mentions: [], createdBy: ctx.op.userId, createdAt: ctx.op.wallTime, editedAt: null, status: 'active', kind: 'return' }),
    ];
  }),
  ReopenTask: statusOp('ReopenTask', {}, (p) => set('task', p.id, { verifiedAt: null, verifiedBy: null, completedAt: null, completedBy: null, completeRef: null })),
  DeleteTask: statusOp('DeleteTask', {}, (p, t, ctx) => set('task', p.id, { statusBeforeDelete: t.status, deletedAt: ctx.op.wallTime, deletedBy: ctx.op.userId })),
  RestoreTask: statusOp('RestoreTask', {}, (p) => set('task', p.id, { deletedAt: null, deletedBy: null, statusBeforeDelete: null })),
};

// ---- Catalogue ------------------------------------------------------------------------------

export const CATALOG: Record<string, OpDef> = {
  // ---- Scope roles (admins only, see permissions.ts) ----
  GrantUser: {
    scopes: [ROLES],
    schema: { userId: 'id', displayName: { text: LIMITS.displayName, min: 1 }, keyId: 'id', publicKey: 'str', role: { enum: USER_ROLES }, verifier: 'bool' },
    effects(p, ctx) {
      if (exists(ctx, 'user', p.userId) || exists(ctx, 'key', p.keyId)) return superseded('the user or the key exists already');
      if (!ctx.isValidKeyBinding(p.keyId, p.publicKey)) return superseded('the key ID does not match the public key');
      return ok([
        ...set('user', p.userId, { displayName: p.displayName, role: p.role, verifier: p.verifier, status: 'active' }),
        ...set('key', p.keyId, { userId: p.userId, alg: 'Ed25519', publicKey: p.publicKey, cutoff: null }),
      ]);
    },
    revertible: false,
  },
  UpdateUser: {
    scopes: [ROLES],
    schema: { userId: 'id', displayName: { text: LIMITS.displayName, min: 1 } },
    effects: (p, ctx) => {
      const u = ctx.get('user', p.userId);
      return u ? ok(changes('user', u, { displayName: p.displayName })) : superseded('the user does not exist');
    },
    revertible: true,
  },
  SetRole: {
    scopes: [ROLES],
    schema: { userId: 'id', role: { enum: USER_ROLES } },
    effects: (p, ctx) => {
      const u = ctx.get('user', p.userId);
      return u && u.status === 'active' ? ok(changes('user', u, { role: p.role })) : superseded('the user is not active');
    },
    revertible: true,
  },
  SetVerifier: {
    scopes: [ROLES],
    schema: { userId: 'id', verifier: 'bool' },
    effects: (p, ctx) => {
      const u = ctx.get('user', p.userId);
      return u && u.status === 'active' ? ok(changes('user', u, { verifier: p.verifier })) : superseded('the user is not active');
    },
    revertible: true,
  },
  AddKey: {
    scopes: [ROLES],
    schema: { userId: 'id', keyId: 'id', publicKey: 'str' },
    effects(p, ctx) {
      const u = ctx.get('user', p.userId);
      if (!u || u.status !== 'active') return superseded('the user is not active');
      if (exists(ctx, 'key', p.keyId)) return superseded('the key exists already');
      if (!ctx.isValidKeyBinding(p.keyId, p.publicKey)) return superseded('the key ID does not match the public key');
      return ok(set('key', p.keyId, { userId: p.userId, alg: 'Ed25519', publicKey: p.publicKey, cutoff: null }));
    },
    revertible: false,
  },
  RevokeKey: {
    scopes: [ROLES],
    schema: { keyId: 'id', cutoff },
    check: (p) => ((p.cutoff as { roles: number; data: number }).roles < 0 || (p.cutoff as { data: number }).data < 0 ? 'cutoff: must not be negative' : null),
    effects(p, ctx) {
      const k = ctx.get('key', p.keyId);
      if (!k) return superseded('the key does not exist');
      return ok(changes('key', k, { cutoff: minCutoff(k.cutoff as Cut | null, p.cutoff) }));
    },
    revertible: false,
  },
  RemoveUser: {
    scopes: [ROLES],
    schema: { userId: 'id', cutoffs: { map: cutoff, max: 50 } },
    effects(p, ctx) {
      const u = ctx.get('user', p.userId);
      if (!u || u.status !== 'active') return superseded('the user is not active');
      const w: Write[] = set('user', p.userId, { status: 'removed' });
      for (const k of ctx.list('key')) {
        if (k.userId !== p.userId) continue;
        // A key that the payload does not list gets the cutoff 0: none of its ops are valid.
        const c: Cut = (p.cutoffs as Record<string, Cut>)[k.id] ?? { roles: 0, data: 0 };
        w.push(...changes('key', k, { cutoff: minCutoff(k.cutoff as Cut | null, c) }));
      }
      return ok(w);
    },
    revertible: false,
  },
  SetSetting: {
    scopes: [ROLES],
    schema: { key: { enum: ['dueSoonDays', 'pollSeconds', 'maxAttachmentMB', 'defaultTags'] }, value: 'any' },
    check(p) {
      if (p.key === 'defaultTags') {
        const v = p.value;
        return Array.isArray(v) && v.length <= MAX_DEFAULT_TAGS && v.every((x) => typeof x === 'string' && /^[A-Za-z0-9._:|/-]{1,120}$/.test(x)) ? null : 'value: list of tag IDs expected';
      }
      const [min, max] = SETTING_RANGES[p.key as keyof typeof SETTING_RANGES];
      return Number.isSafeInteger(p.value) && (p.value as number) >= min && (p.value as number) <= max ? null : `value: integer ${min}–${max} expected`;
    },
    effects: (p, ctx) => {
      const cur = ctx.get('setting', p.key);
      return ok(cur ? changes('setting', cur, { value: p.value }) : set('setting', p.key, { value: p.value }));
    },
    revertible: true,
  },

  // ---- Scope data: tasks ----
  CreateTask: {
    scopes: [DATA],
    schema: { id: 'id', title, 'description?': description, 'due?': due },
    effects(p, ctx) {
      if (exists(ctx, 'task', p.id)) return superseded('the task ID exists already');
      return ok(
        set('task', p.id, {
          title: p.title,
          description: p.description ?? '',
          status: 'new',
          due: p.due ?? null,
          createdAt: ctx.op.wallTime,
          createdBy: ctx.op.userId,
        }),
      );
    },
    revertible: true,
  },
  UpdateTask: {
    scopes: [DATA],
    schema: { id: 'id', fields: { object: { 'title?': title, 'description?': description, 'due?': due, 'completedAt?': 'iso' } } },
    check: (p) => (Object.keys(p.fields as object).length ? null : 'fields: at least 1 field expected'),
    effects(p, ctx) {
      const task = liveTask(ctx, p.id);
      if (typeof task === 'string') return superseded(task);
      const fields = { ...(p.fields as Record<string, unknown>) };
      // completedAt: only while done, and only by completedBy or an admin (Q-12, data-model §6.1).
      const refused = 'completedAt can change only on a done task, by its completer or an admin';
      if ('completedAt' in fields) {
        const allowed = task.status === 'done' && (task.completedBy === ctx.op.userId || userIsAdmin(ctx.state, ctx.op.userId));
        if (!allowed) {
          delete fields.completedAt;
          const w = changes('task', task, fields);
          return w.length ? { writes: w } : superseded(refused);
        }
      }
      return ok(changes('task', task, fields));
    },
    revertible: true,
  },
  ...STATUS_DEFS,

  // ---- Assignees ----
  AddAssignee: {
    scopes: [DATA],
    schema: { taskId: 'id', userId: 'id' },
    effects(p, ctx) {
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      const u = ctx.getIn(ROLES, 'user', p.userId);
      if (!u || u.status !== 'active') return superseded('the user is not active');
      const id = `${p.taskId}/${p.userId}`;
      const cur = ctx.get('assignee', id);
      if (cur?.on === true) return { noEffect: 'the user is assigned already' };
      return ok(set('assignee', id, { taskId: p.taskId, userId: p.userId, on: true, by: ctx.op.userId, at: ctx.op.wallTime }));
    },
    revertible: true,
  },
  RemoveAssignee: {
    scopes: [DATA],
    schema: { taskId: 'id', userId: 'id' },
    effects(p, ctx) {
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      const id = `${p.taskId}/${p.userId}`;
      const cur = ctx.get('assignee', id);
      if (cur?.on !== true) return { noEffect: 'the user is not assigned' };
      return ok(set('assignee', id, { on: false, by: ctx.op.userId, at: ctx.op.wallTime }));
    },
    revertible: true,
  },

  // ---- Tags ----
  CreateTag: {
    scopes: [DATA],
    schema: { id: 'id', name: { text: LIMITS.tagName, min: 1 } },
    check: (p) => (normalizeTagName(p.name as string) ? null : 'name: empty after normalization'),
    effects(p, ctx) {
      if (exists(ctx, 'tag', p.id)) return superseded('the tag ID exists already');
      const norm = normalizeTagName(p.name);
      const first = activeTagByName(ctx, norm, null);
      const order = tagOrder(ctx.op);
      return ok(set('tag', p.id, { name: p.name.trim(), norm, order, status: first ? 'merged' : 'active', mergedInto: first ? first.id : null }));
    },
    revertible: true,
  },
  AddTaskTag: {
    scopes: [DATA],
    schema: { taskId: 'id', tagId: 'id' },
    effects(p, ctx) {
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      const root = resolveTag(ctx.state, p.tagId);
      if (!root || root.status !== 'active') return superseded('the tag does not exist or is deleted');
      if (taskTagsOf(ctx.state, p.taskId).some((tt) => tt.on === true && resolveTag(ctx.state, tt.tagId as string)?.id === root.id)) return { noEffect: 'the task has the tag already' };
      return ok(set('taskTag', `${p.taskId}/${p.tagId}`, { taskId: p.taskId, tagId: p.tagId, on: true }));
    },
    revertible: true,
  },
  RemoveTaskTag: {
    scopes: [DATA],
    schema: { taskId: 'id', tagId: 'id' },
    effects(p, ctx) {
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      const root = resolveTag(ctx.state, p.tagId);
      const w: Write[] = [];
      // All tag links of the task whose tag resolves to the same tag (data-model §10.3).
      for (const tt of taskTagsOf(ctx.state, p.taskId))
        if (tt.on === true && (tt.tagId === p.tagId || (root && resolveTag(ctx.state, tt.tagId as string)?.id === root.id))) w.push({ e: 'taskTag', id: tt.id, f: 'on', v: false });
      return w.length ? { writes: w } : { noEffect: 'the task does not have the tag' };
    },
    revertible: true,
  },
  RenameTag: {
    scopes: [DATA],
    schema: { id: 'id', name: { text: LIMITS.tagName, min: 1 } },
    check: (p) => (normalizeTagName(p.name as string) ? null : 'name: empty after normalization'),
    effects(p, ctx) {
      const tag = ctx.get('tag', p.id);
      if (!tag || tag.status !== 'active') return superseded('the tag is not active');
      const norm = normalizeTagName(p.name);
      if (activeTagByName(ctx, norm, p.id)) return superseded('another active tag has this name');
      return ok(changes('tag', tag, { name: p.name.trim(), norm }));
    },
    revertible: true,
  },
  MergeTag: {
    scopes: [DATA],
    schema: { id: 'id', into: 'id' },
    effects(p, ctx) {
      const a = ctx.get('tag', p.id);
      const b = ctx.get('tag', p.into);
      if (p.id === p.into || a?.status !== 'active' || b?.status !== 'active') return superseded('both tags must be active and different');
      return ok(set('tag', p.id, { status: 'merged', mergedInto: p.into }));
    },
    revertible: true,
  },
  DeleteTag: {
    scopes: [DATA],
    schema: { id: 'id' },
    effects(p, ctx) {
      const tag = ctx.get('tag', p.id);
      return tag?.status === 'active' ? ok(set('tag', p.id, { status: 'deleted' })) : superseded('the tag is not active');
    },
    revertible: true,
  },

  // ---- Subtasks ----
  AddSubtask: {
    scopes: [DATA],
    schema: { id: 'id', taskId: 'id', text: { text: LIMITS.subtask, min: 1 }, pos },
    check: posCheck,
    effects(p, ctx) {
      if (exists(ctx, 'subtask', p.id)) return superseded('the subtask ID exists already');
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      return ok(set('subtask', p.id, { taskId: p.taskId, text: p.text, pos: p.pos, done: false, doneBy: null, doneAt: null, status: 'active' }));
    },
    revertible: true,
  },
  EditSubtask: childEdit('subtask', { text: { text: LIMITS.subtask, min: 1 } }),
  CheckSubtask: {
    scopes: [DATA],
    schema: { id: 'id', done: 'bool' },
    effects(p, ctx) {
      const c = liveChild(ctx, 'subtask', p.id);
      if (typeof c === 'string') return superseded(c);
      if (c.ent.done === p.done) return { noEffect: 'no change' };
      return ok(set('subtask', p.id, { done: p.done, doneBy: p.done ? ctx.op.userId : null, doneAt: p.done ? ctx.op.wallTime : null }));
    },
    revertible: true,
  },
  MoveSubtask: { ...childEdit('subtask', { pos }), check: posCheck },
  RemoveSubtask: childRemove('subtask', 'removed'),

  // ---- Attachments ----
  AddAttachment: {
    scopes: [DATA],
    schema: { id: 'id', taskId: 'id', sha256: 'hex64', name: { text: LIMITS.fileName, min: 1 }, mime: { text: LIMITS.mime }, size: 'int' },
    check: (p) => nonNegative(p) ?? (isBlockedFileName(p.name as string) ? 'name: this file type cannot be attached' : null),
    effects(p, ctx) {
      if (exists(ctx, 'attachment', p.id)) return superseded('the attachment ID exists already');
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      if (ctx.get('blob', p.sha256)?.purged === true) return superseded('an admin removed this file');
      if (p.size > settingsOf(ctx.state).maxAttachmentMB * 1024 * 1024) return superseded('the file is larger than the limit');
      return ok(set('attachment', p.id, { taskId: p.taskId, sha256: p.sha256, name: p.name, mime: p.mime, size: p.size, uploadedBy: ctx.op.userId, uploadedAt: ctx.op.wallTime, status: 'active' }));
    },
    revertible: true,
  },
  RemoveAttachment: childRemove('attachment', 'removed'),
  PurgeBlob: {
    scopes: [DATA],
    schema: { sha256: 'hex64', reason: { text: LIMITS.reason } },
    effects(p, ctx) {
      if (ctx.get('blob', p.sha256)?.purged === true) return { noEffect: 'purged already' };
      return ok(set('blob', p.sha256, { purged: true, purgedBy: ctx.op.userId, purgedAt: ctx.op.wallTime, reason: p.reason }));
    },
    revertible: false,
  },

  // ---- Links ----
  AddLink: {
    scopes: [DATA],
    schema: { id: 'id', taskId: 'id', url: urlType, title: { text: LIMITS.linkTitle } },
    effects(p, ctx) {
      if (exists(ctx, 'link', p.id)) return superseded('the link ID exists already');
      const task = liveTask(ctx, p.taskId);
      if (typeof task === 'string') return superseded(task);
      return ok(set('link', p.id, { taskId: p.taskId, url: p.url, title: p.title, status: 'active' }));
    },
    revertible: true,
  },
  EditLink: childEdit('link', { url: urlType, title: { text: LIMITS.linkTitle } }),
  RemoveLink: childRemove('link', 'removed'),

  // ---- Comments (also on verified tasks) ----
  AddComment: {
    scopes: [DATA],
    schema: { id: 'id', taskId: 'id', text: commentText, mentions },
    effects(p, ctx) {
      if (exists(ctx, 'comment', p.id)) return superseded('the comment ID exists already');
      const task = liveTask(ctx, p.taskId, true);
      if (typeof task === 'string') return superseded(task);
      return ok(set('comment', p.id, { taskId: p.taskId, text: p.text, mentions: p.mentions, createdBy: ctx.op.userId, createdAt: ctx.op.wallTime, editedAt: null, status: 'active', kind: 'comment' }));
    },
    revertible: true,
  },
  EditComment: {
    scopes: [DATA],
    schema: { id: 'id', text: commentText, mentions },
    effects(p, ctx) {
      const c = liveChild(ctx, 'comment', p.id, true);
      if (typeof c === 'string') return superseded(c);
      const w = changes('comment', c.ent, { text: p.text, mentions: p.mentions });
      return w.length ? { writes: [...w, { e: 'comment', id: p.id, f: 'editedAt', v: ctx.op.wallTime }] } : { noEffect: 'no change' };
    },
    revertible: true,
  },
  DeleteComment: childRemove('comment', 'deleted', true),
};

// ---- Helpers that use the catalogue structure ------------------------------------------------

function childEdit(e: string, fields: Schema): OpDef {
  return {
    scopes: [DATA],
    schema: { id: 'id', ...fields },
    effects(p, ctx) {
      const c = liveChild(ctx, e, p.id);
      if (typeof c === 'string') return superseded(c);
      const vals: Record<string, unknown> = {};
      for (const f of Object.keys(fields)) vals[f.replace(/\?$/, '')] = p[f.replace(/\?$/, '')];
      return ok(changes(e, c.ent, vals));
    },
    revertible: true,
  };
}

function childRemove(e: string, removed: 'removed' | 'deleted', allowVerified = false): OpDef {
  return {
    scopes: [DATA],
    schema: { id: 'id' },
    effects(p, ctx) {
      const c = liveChild(ctx, e, p.id, allowVerified);
      if (typeof c === 'string') return superseded(c);
      return ok(set(e, p.id, { status: removed }));
    },
    revertible: true,
  };
}

/** The first active tag (in creation order) with this normalized name, except `except`. */
function activeTagByName(ctx: EffectCtx, norm: string, except: string | null): Entity | null {
  let best: Entity | null = null;
  for (const t of ctx.list('tag'))
    if (t.status === 'active' && t.norm === norm && t.id !== except && (best === null || (t.order as string) < (best.order as string))) best = t;
  return best;
}

type Cut = { roles: number; data: number };
function minCutoff(a: Cut | null, b: Cut): Cut {
  return a ? { roles: Math.min(a.roles, b.roles), data: Math.min(a.data, b.data) } : { roles: b.roles, data: b.data };
}

// Every op type rejects "/" in the fields of composite keys (before its own check).
for (const def of Object.values(CATALOG)) {
  const own = def.check;
  def.check = (p) => slashCheck(p) ?? own?.(p) ?? null;
}
