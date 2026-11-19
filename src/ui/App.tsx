// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The app shell: header, sidebar, routes, the task panel, messages and keyboard shortcuts.
import { AuthError, SupersededError, type AuditStatus, type Engine, type Storage } from 'oplog-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DATA } from '../domain/constants';
import { buildSearchIndex } from '../domain/search';
import { rolesOf, settingsOf, userIsAdmin, userIsVerifier } from '../domain/state';
import { buildTaskViews, dueState } from '../domain/view';
import { AdminPage } from './admin';
import { Ctx, focusTask, href, parseRoute, type AppCtx, type Me, type Model, type Toast, type UserInfo } from './ctx';
import { NewTaskDialog } from './dialogs';
import { collator, fmtRelative, t, type Key } from './i18n';
import { baseTasks, TaskList, type ListKind } from './TaskList';
import { TaskPanel } from './TaskPanel';

const FILTER_KEY = 'mytasker.lastQuery';


function buildModel(engine: Engine): Model {
  const views = buildTaskViews(engine.state);
  const users = new Map<string, UserInfo>();
  for (const u of Object.values(rolesOf(engine.state).user ?? {}))
    users.set(u.id, { id: u.id, name: String(u.displayName ?? u.id), role: u.role === 'admin' ? 'admin' : 'user', verifier: u.verifier === true, status: u.status === 'active' ? 'active' : 'removed', root: u.root === true });
  const tags = Object.values(engine.state.scopes[DATA]?.tag ?? {})
    .filter((x) => x.status === 'active')
    .map((x) => ({ id: x.id, name: String(x.name) }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { views, search: buildSearchIndex(views.values()), users, tags, settings: settingsOf(engine.state) };
}

export interface AppProps {
  engine: Engine;
  storage: Storage;
  me: Me;
  demo: boolean;
  /** Called after each change of the known ops (to save the encrypted cache). */
  onChange?: () => void;
  onLock(): void;
  /** Demo only: switch the demo user. */
  demoUsers?: { id: string; name: string }[];
  onDemoUser?: (id: string) => void;
}

export function App(props: AppProps) {
  const { engine, storage, me, demo } = props;
  const [version, setVersion] = useState(0);
  const [hash, setHash] = useState(location.hash);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newTask, setNewTask] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [updated, setUpdated] = useState(Date.now());
  const search = useRef<HTMLInputElement>(null);
  const model = useMemo(() => buildModel(engine), [version]);
  const route = parseRoute(hash);

  const bump = useCallback(() => {
    setVersion((x) => x + 1);
    setUpdated(Date.now());
    setNow(Date.now());
    props.onChange?.();
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 3500);
  }, []);

  const refresh = useCallback(async (mode: 'quick' | 'full' = 'full') => {
    try {
      if (await engine.scan(mode)) bump();
      else setUpdated(Date.now());
    } catch (e) {
      toast(t('msg.error', { reason: (e as Error).message }), 'error');
    }
  }, []);

  // Route from the hash. The filters of the last list view are remembered locally (not secret, ADR 0006).
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    if (!location.hash) {
      let last = '';
      try {
        last = localStorage.getItem(FILTER_KEY) ?? '';
      } catch {
        /* storage blocked */
      }
      location.hash = last.startsWith('#/') ? last : '#/all';
    }
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (['all', 'mine', 'review', 'created'].includes(route.path[0])) {
      const { task: _task, ...rest } = route.query;
      try {
        localStorage.setItem(FILTER_KEY, href(route.path, rest));
      } catch {
        /* storage blocked */
      }
    }
  }, [hash]);

  // Polling (FileSystemObserver is optional; polling is the fallback and stays on).
  useEffect(() => {
    const ms = Math.max(5, model.settings.pollSeconds) * 1000;
    let n = 0;
    const id = setInterval(() => {
      setNow(Date.now());
      void refresh(++n % 8 === 0 ? 'full' : 'quick');
    }, ms);
    return () => clearInterval(id);
  }, [model.settings.pollSeconds]);

  const isAdmin = userIsAdmin(engine.state, me.userId);
  const isVerifier = userIsVerifier(engine.state, me.userId) || isAdmin;

  const ctx: AppCtx = {
    ...model,
    engine,
    storage,
    me,
    version,
    now,
    isAdmin,
    isVerifier,
    demo,
    route,
    nav: (h) => {
      location.hash = h;
    },
    setQuery: (patch) => {
      const q = { ...route.query, ...patch };
      for (const k of Object.keys(q)) if (q[k] === undefined || q[k] === '') delete q[k];
      location.hash = href(route.path, q as Record<string, string>);
    },
    check: (type, payload, scope = DATA) => engine.check(me.keyId, scope, type, payload).status,
    act: async (type, payload, scope = DATA): Promise<AuditStatus> => {
      try {
        const env = await engine.write(me.signer, scope, type, payload, { allowSuperseded: true });
        const a = engine.audit.find((x) => x.opId === env.opId);
        bump();
        if (a?.status === 'superseded') toast(t('msg.superseded'), 'info');
        else if (a?.status === 'applied') toast(t('task.saved'), 'ok');
        return a?.status ?? 'applied';
      } catch (e) {
        // The reasons of the engine are English and technical: show a general Czech text (details in the console).
        console.warn(type, (e as Error).message);
        if (e instanceof AuthError || e instanceof SupersededError) toast(t('msg.rejected'), 'error');
        else toast(t('msg.writeFailed', { reason: (e as Error).message }), 'error');
        // Render again, so that controlled inputs (for example a checkbox) show the real state.
        setVersion((x) => x + 1);
        return 'rejected';
      }
    },
    refresh,
    toast,
    userName: (id) => (id ? (model.users.get(id)?.name ?? t('common.unknownUser')) : t('common.none')),
    lock: props.onLock,
  };

  // Keyboard: N = new task, / = search, Esc = close the panel.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape' && typing && el.closest('.drawer')) {
        el.blur();
        return;
      }
      if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]') && parseRoute(location.hash).query.task) {
        const r = parseRoute(location.hash);
        const { task: id, ...q } = r.query;
        location.hash = href(r.path, q);
        focusTask(id);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNewTask(true);
      } else if (e.key === '/') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  const page = route.path[0];
  const listKinds: ListKind[] = ['all', 'mine', 'review', 'created'];
  const mine = baseTasks('mine', model.views, me.userId);
  const overdueMine = mine.filter((v) => dueState(v, now, model.settings.dueSoonDays) === 'overdue').length;
  const count = (k: ListKind) => baseTasks(k, model.views, me.userId).length;
  const issues = isAdmin ? engine.issues.length : 0;
  const myName = ctx.userName(me.userId);

  useEffect(() => {
    document.title = overdueMine > 0 ? `(${overdueMine}) ${t('appName')}` : t('appName');
  }, [overdueMine]);

  return (
    <Ctx.Provider value={ctx}>
      {demo && <div class="demo-banner">{t('demo.banner')}</div>}
      <header class="top">
        <a class="brand" href="#/all">
          <span aria-hidden="true">✓</span> {t('appName')}
        </a>
        <form
          class="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input
            ref={search}
            type="search"
            aria-label={t('top.searchLabel')}
            placeholder={`${t('top.search')}  /`}
            value={route.query.q ?? ''}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              const p = listKinds.includes(page as ListKind) ? route.path : ['all'];
              const h = href(p, { ...(listKinds.includes(page as ListKind) ? route.query : {}), q: v || undefined });
              // Replace the history entry: "Back" must not go back 1 character at a time.
              history.replaceState(null, '', h);
              setHash(h);
            }}
          />
        </form>
        <button type="button" class="primary" onClick={() => setNewTask(true)} title="N">
          + {t('top.new')}
        </button>
        <button type="button" onClick={() => refresh('full')} aria-label={t('top.refresh')} title={t('top.refresh')}>
          ↻
        </button>
        <span class="me">
          {demo && props.demoUsers ? (
            <label>
              <span class="sr-only">{t('demo.as')}</span>
              <select value={me.userId} onChange={(e) => props.onDemoUser?.((e.target as HTMLSelectElement).value)}>
                {props.demoUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>{myName}</span>
          )}
          {!demo && (
            <button type="button" class="link small" onClick={props.onLock}>
              {t('top.lock')}
            </button>
          )}
        </span>
      </header>
      <div class="layout">
        <nav class="side" aria-label={t('nav.main')}>
          <ul>
            {listKinds
              .filter((k) => k !== 'review' || isVerifier)
              .map((k) => (
                <li key={k}>
                  <a href={href([k])} aria-current={page === k ? 'page' : undefined}>
                    <span>{t(`nav.${k}` as Key)}</span>
                    <span class={`badge ${k === 'mine' && overdueMine ? 'alert' : ''}`}>{count(k)}</span>
                  </a>
                </li>
              ))}
          </ul>
          {isAdmin && (
            <>
              <h2 class="side-head">{t('nav.admin')}</h2>
              <ul>
                {(['trash', 'users', 'enroll', 'tags', 'settings', 'checkpoints', 'audit', 'integrity'] as const).map((p) => (
                  <li key={p}>
                    <a href={href(['admin', p])} aria-current={page === 'admin' && route.path[1] === p ? 'page' : undefined}>
                      <span>{t(`nav.${p}` as Key)}</span>
                      {p === 'integrity' && issues > 0 && <span class="badge alert">{issues}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p class="side-foot muted small">{t('top.updated', { when: fmtRelative(new Date(updated).toISOString(), now) })}</p>
        </nav>
        <main id="main" data-route={hash}>
          {listKinds.includes(page as ListKind) ? <TaskList kind={page as ListKind} /> : page === 'admin' ? <AdminPage page={route.path[1] ?? 'users'} /> : <TaskList kind="all" />}
        </main>
        {route.query.task && <TaskPanel key={route.query.task} id={route.query.task} />}
      </div>
      {newTask && <NewTaskDialog onClose={() => setNewTask(false)} />}
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} class={`toast toast-${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

