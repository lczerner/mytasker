// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Full-text search over title, description, subtasks and comments.
// Case- and diacritics-insensitive: "ukol" finds "Úkol".

import { fold } from './text';
import type { TaskView } from './view';

/** The search text of a task. Build it 1 time for each state. */
export function searchText(v: TaskView): string {
  const parts = [v.title, v.description, ...v.subtasks.map((s) => String(s.text ?? '')), ...v.comments.filter((c) => c.status === 'active').map((c) => String(c.text ?? ''))];
  return fold(parts.join('\n'));
}

/** Terms of a query. A task matches if its text contains all terms. */
export const queryTerms = (q: string): string[] => fold(q).split(/\s+/).filter(Boolean);

export const matches = (text: string, terms: string[]): boolean => terms.every((t) => text.includes(t));

export function buildSearchIndex(views: Iterable<TaskView>): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of views) m.set(v.id, searchText(v));
  return m;
}
