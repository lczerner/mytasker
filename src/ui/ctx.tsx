// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// App context: engine, current user, derived data, route and actions.
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AuditStatus, Engine, Signer, Storage } from 'oplog-core';
import type { Settings, Status } from '../domain/constants';
import type { TaskView } from '../domain/view';

export interface Me {
  userId: string;
  keyId: string;
  signer: Signer;
}

export interface UserInfo {
  id: string;
  name: string;
  role: 'admin' | 'user';
  verifier: boolean;
  status: 'active' | 'removed';
  root: boolean;
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

export interface Model {
  views: Map<string, TaskView>;
  search: Map<string, string>;
  users: Map<string, UserInfo>;
  /** Active tags, sorted by name (Czech collation). */
  tags: { id: string; name: string }[];
  settings: Settings;
}

export interface AppCtx extends Model {
  engine: Engine;
  storage: Storage;
  me: Me;
  /** Changes after each replay, to render again. */
  version: number;
  now: number;
  isAdmin: boolean;
  isVerifier: boolean;
  demo: boolean;
  route: Route;
  nav(hash: string): void;
  /** Changes some query parameters of the current route (undefined removes a parameter). */
  setQuery(patch: Record<string, string | undefined>): void;
  /**
   * Writes 1 op. Shows a message for an error or a superseded op.
   * Returns the status of the op ('rejected' also for errors before the write).
   */
  act(type: string, payload: Record<string, unknown>, scope?: string): Promise<AuditStatus>;
  /** The status that the op would have now (authorize + effects), with no write. */
  check(type: string, payload: Record<string, unknown>, scope?: string): AuditStatus;
  refresh(mode?: 'quick' | 'full'): Promise<void>;
  toast(text: string, kind?: Toast['kind']): void;
  userName(id: string | null | undefined): string;
  lock(): void;
}

export interface Route {
  path: string[];
  query: Record<string, string>;
}

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  const query: Record<string, string> = {};
  for (const kv of q.split('&').filter(Boolean)) {
    const i = kv.indexOf('=');
    const k = i < 0 ? kv : kv.slice(0, i);
    const v = i < 0 ? '' : kv.slice(i + 1);
    try {
      query[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      /* ignore a bad parameter */
    }
  }
  const path = p
    .split('/')
    .filter(Boolean)
    .map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return '';
      }
    });
  return { path: path.length ? path : ['all'], query };
}

export const href = (path: (string | number)[], query: Record<string, string | undefined> = {}): string => {
  const q = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join('&');
  return '#/' + path.map((x) => encodeURIComponent(String(x))).join('/') + (q ? `?${q}` : '');
};

export const STATUS_ICON: Record<Status, string> = { new: '○', assigned: '◐', postponed: '⏸', done: '✓', verified: '✔✔', deleted: '✕' };

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

/** After the panel closes, the focus goes back to the card or row of the task. */
export function focusTask(id: string): void {
  // A task that is not on the shown page (or not in the view): the main content gets the focus.
  requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-task="${CSS.escape(id)}"]`) ?? document.getElementById('main'))?.focus());
}
