// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Constants of the domain (docs/data-model.md).

export const ROLES = 'roles';
export const DATA = 'data';
export const SCOPES = [ROLES, DATA] as const;
export type Scope = (typeof SCOPES)[number];

/** Name of the key file format (oplog-core KeyFile.format). */
export const KEY_FILE_FORMAT = 'mytasker-key';
/** Format name of an enrollment request (oplog-core EnrollmentRequest.format). */
export const ENROLL_FORMAT = 'mytasker-enroll';

export const STATUSES = ['new', 'assigned', 'postponed', 'done', 'verified', 'deleted'] as const;
export type Status = (typeof STATUSES)[number];

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Text limits (docs/data-model.md §5.6). */
export const LIMITS = {
  title: 200,
  description: 20_000,
  comment: 10_000,
  subtask: 500,
  tagName: 40,
  url: 2_000,
  linkTitle: 200,
  fileName: 255,
  mime: 100,
  displayName: 80,
  reason: 500,
  mentions: 50,
} as const;

export interface Settings {
  dueSoonDays: number;
  pollSeconds: number;
  maxAttachmentMB: number;
  defaultTags: string[];
}

export const DEFAULT_SETTINGS: Settings = { dueSoonDays: 2, pollSeconds: 15, maxAttachmentMB: 25, defaultTags: [] };

/** Valid range of each integer setting. */
export const SETTING_RANGES: Record<'dueSoonDays' | 'pollSeconds' | 'maxAttachmentMB', [number, number]> = {
  dueSoonDays: [0, 30],
  pollSeconds: [5, 600],
  maxAttachmentMB: [1, 250],
};

export const MAX_DEFAULT_TAGS = 20;
