// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Notifications: the read state (encrypted, per user), the bell with the list, and the start banner.
// The notifications come from src/domain/notifications.ts (docs/data-model.md §12).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { computeNotifications, initialReadState, markRead as addRead, unread, type Notification, type NotificationKind, type ReadState } from '../domain/notifications';
import { dueState } from '../domain/view';
import { href, useApp } from './ctx';
import { fmtRelative, nTasks, nUnread, nVerifyWaiting, t, type Key } from './i18n';

/** Storage of small per-user data. Real folder: encrypted in IndexedDB. Demo: in memory. */
export interface UserData {
  load<T>(name: string): Promise<T | undefined>;
  save(name: string, value: unknown): Promise<void>;
}

const READ_NAME = 'notifications';
/** The list shows the unread notifications and the newest read ones, at most this number. */
export const LIST_MAX = 50;

const ICON: Record<NotificationKind, string> = {
  due: '⏰',
  overdue: '‼',
  assigned: '➜',
  comment: '💬',
  mention: '@',
  returned: '↩',
  superseded: '⚠',
  verify: '✔',
};

export interface NotifModel {
  /** All notifications, the newest first. */
  all: Notification[];
  unread: Notification[];
  unreadIds: ReadonlySet<string>;
  /** False until the read state is loaded (the bell shows no count before). */
  ready: boolean;
  /** True when no save of the read state is pending. */
  saved: boolean;
  markRead(items: Notification[]): void;
}

/** Computes the notifications and keeps the read state. */
export function useNotifications(data: UserData): NotifModel {
  const app = useApp();
  const [rs, setRs] = useState<ReadState | null>(null);
  const failed = useRef(false);
  // The saves run 1 after the other: the newest state is always written last.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const persist = (s: ReadState) => {
    if (failed.current) return;
    setPending((x) => x + 1);
    chain.current = chain.current
      .then(() => data.save(READ_NAME, s))
      .catch((e) => console.warn('notifications: cannot save the read state', e))
      .finally(() => setPending((x) => x - 1));
  };
  useEffect(() => {
    let live = true;
    data.load<ReadState>(READ_NAME).then(
      (v) => {
        if (!live) return;
        const { state, save } = initialReadState(v, Date.now());
        setRs(state);
        if (save) persist(state);
      },
      (e) => {
        // A load error is not "no record": do not save, or the stored read state is lost.
        // The bell works for this session; read marks are kept in memory only.
        console.warn('notifications: cannot load the read state', e);
        if (live) setRs({ ...initialReadState(undefined, Date.now()).state });
        failed.current = true;
      },
    );
    return () => {
      live = false;
    };
  }, []);
  const all = useMemo(
    () => computeNotifications({ state: app.engine.state, audit: app.engine.audit, views: app.views, me: app.me.userId, now: app.now }),
    [app.version, app.now],
  );
  const readSet = useMemo(() => new Set((rs?.read ?? []).map((x) => x.id)), [rs]);
  const un = useMemo(() => (rs ? unread(all, readSet, rs.baseline) : []), [all, readSet, rs]);
  const unreadIds = useMemo(() => new Set(un.map((n) => n.id)), [un]);
  const markRead = (items: Notification[]) => {
    if (!rs || !items.length) return;
    const next = addRead(rs, items);
    if (next === rs) return;
    setRs(next);
    persist(next);
  };
  return { all, unread: un, unreadIds, ready: rs !== null, saved: pending === 0, markRead };
}

/** The text of 1 notification: [kind line, task title]. */
export function notifText(n: Notification, title: (id: string | null) => string): { kind: string; title: string } {
  return { kind: t(`notif.${n.kind}` as Key), title: n.taskId ? title(n.taskId) : '' };
}

export function Bell({ model }: { model: NotifModel }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const n = model.unread.length;
  // A click outside the list or Esc closes it.
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const list = useMemo(() => {
    const un = model.all.filter((x) => model.unreadIds.has(x.id));
    const rest = model.all.filter((x) => !model.unreadIds.has(x.id));
    return [...un, ...rest].slice(0, LIST_MAX);
  }, [model.all, model.unreadIds]);
  const title = (id: string | null) => (id ? (app.views.get(id)?.title ?? t('notif.unknownTask')) : '');

  return (
    <div class="bell" ref={box} data-ready={model.ready ? '1' : undefined} data-saved={model.saved ? '1' : undefined}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="notif-list"
        aria-label={n ? `${t('top.notifications')}: ${nUnread(n)}` : t('top.notifications')}
        title={t('top.notifications')}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">🔔</span>
        {n > 0 && (
          <span class="bell-n" aria-hidden="true">
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>
      {open && (
        <div id="notif-list" class="notif-pop" role="region" aria-label={t('top.notifications')}>
          <div class="row notif-head">
            <h2>{t('top.notifications')}</h2>
            <button type="button" class="link" disabled={!n} onClick={() => model.markRead(model.unread)}>
              {t('notif.allRead')}
            </button>
          </div>
          {list.length === 0 ? (
            <p class="muted">{t('notif.empty')}</p>
          ) : (
            <ul>
              {list.map((x) => {
                const tx = notifText(x, title);
                const isNew = model.unreadIds.has(x.id);
                const target = x.taskId && app.views.has(x.taskId) ? href(['all'], { task: x.taskId }) : null;
                const onClick = () => {
                  model.markRead([x]);
                  setOpen(false);
                };
                // A notification without a known task is a button (a link without href has no keyboard access).
                const Tag = target ? 'a' : 'button';
                return (
                  <li key={x.id} class={isNew ? 'unread' : ''}>
                    <Tag class="notif-item" {...(target ? { href: target } : { type: 'button' })} onClick={onClick}>
                      <span class="notif-icon" aria-hidden="true">
                        {ICON[x.kind]}
                      </span>
                      <span class="notif-body">
                        <span class="notif-kind">
                          {isNew && <span class="sr-only">{t('notif.new')} </span>}
                          {tx.kind}
                        </span>
                        {tx.title && <span class="notif-title">{tx.title}</span>}
                        {x.kind === 'returned' && x.detail && <span class="notif-detail">{x.detail.slice(0, 140)}</span>}
                        <span class="notif-meta">
                          {x.by ? `${app.userName(x.by)} · ` : ''}
                          {fmtRelative(x.at, app.now)}
                        </span>
                      </span>
                    </Tag>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The start banner: overdue tasks of the user and tasks to verify. Shows 1 time after the start. */
export function StartBanner() {
  const app = useApp();
  const [closed, setClosed] = useState(false);
  // Computed 1 time, when the app starts: a later change does not show the banner again.
  const [parts] = useState(() => {
    const me = app.me.userId;
    let overdue = 0;
    let verify = 0;
    for (const v of app.views.values()) {
      // The same rule as the view "Moje úkoly", the target of the link.
      const mine = v.assignees.includes(me);
      if (mine && dueState(v, app.now, app.settings.dueSoonDays) === 'overdue') overdue++;
      if (app.isVerifier && v.status === 'done') verify++;
    }
    const out: { text: string; link: string }[] = [];
    if (overdue) out.push({ text: t('banner.overdue', { n: nTasks(overdue) }), link: href(['mine']) });
    if (verify) out.push({ text: nVerifyWaiting(verify), link: href(['review']) });
    return out;
  });
  if (closed || !parts.length) return null;
  return (
    <div class="start-banner" role="status">
      {parts.map((p, i) => (
        <span key={p.link}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a href={p.link}>{p.text}</a>
        </span>
      ))}
      <button type="button" class="link chip-x" aria-label={t('banner.close')} onClick={() => setClosed(true)}>
        ×
      </button>
    </div>
  );
}
