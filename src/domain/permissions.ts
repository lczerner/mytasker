// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Permission matrix (docs/data-model.md §6). This table is DATA.
// Change it only with the owner's approval. authorize() is the only gate.

export type Cond = 'any' | 'ownTask' | 'ownComment';

/** Who can issue an op type. A verifier is a user with the verifier flag. An admin can do all that a user can. */
export interface Rule {
  user?: Cond;
  verifier?: Cond;
  admin?: Cond;
}

const U: Rule = { user: 'any', admin: 'any' };
const A: Rule = { admin: 'any' };

export const PERMISSIONS: Record<string, Rule> = {
  // Scope roles: admins only.
  GrantUser: A,
  UpdateUser: A,
  SetRole: A,
  SetVerifier: A,
  AddKey: A,
  RevokeKey: A,
  RemoveUser: A,
  SetSetting: A,
  // Tasks and status.
  CreateTask: U,
  UpdateTask: U,
  PostponeTask: U,
  ResumeTask: U,
  CompleteTask: U,
  VerifyTask: { verifier: 'any', admin: 'any' },
  ReturnTask: { verifier: 'any', admin: 'any' },
  ReopenTask: A,
  DeleteTask: { user: 'ownTask', admin: 'any' },
  RestoreTask: A,
  // Assignees and tags.
  AddAssignee: U,
  RemoveAssignee: U,
  CreateTag: U,
  AddTaskTag: U,
  RemoveTaskTag: U,
  RenameTag: A,
  MergeTag: A,
  DeleteTag: A,
  // Subtasks, attachments, links, comments.
  AddSubtask: U,
  EditSubtask: U,
  CheckSubtask: U,
  MoveSubtask: U,
  RemoveSubtask: U,
  AddAttachment: U,
  RemoveAttachment: U,
  PurgeBlob: A,
  AddLink: U,
  EditLink: U,
  RemoveLink: U,
  AddComment: U,
  EditComment: { user: 'ownComment', admin: 'any' },
  DeleteComment: { user: 'ownComment', admin: 'any' },
  // Generic ops of oplog-core.
  Revert: A,
};

export interface Who {
  userId: string;
  admin: boolean;
  verifier: boolean;
}

/** The condition that applies to this user, or null if the user cannot issue the op. The most permissive role wins. */
export function conditionFor(rule: Rule, who: Who): Cond | null {
  const conds: Cond[] = [];
  if (rule.user) conds.push(rule.user);
  if (who.verifier && rule.verifier) conds.push(rule.verifier);
  if (who.admin && rule.admin) conds.push(rule.admin);
  if (conds.includes('any')) return 'any';
  return conds[0] ?? null;
}
