// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Task views: filters, board and table.
import { useMemo, useState } from 'preact/hooks';
import type { Status } from '../domain/constants';
import { matches, queryTerms } from '../domain/search';
import { dueState, type TaskView } from '../domain/view';
import { href, useApp } from './ctx';
import { collator, fmtDate, nTasks, statusLabel, t, type Key, nShowMore } from './i18n';
import { Avatar, DueLabel, StatusBadge, TagChip } from './widgets';

export type ListKind = 'all' | 'mine' | 'review' | 'created';
const BOARD: Status[] = ['new', 'assigned', 'postponed', 'done', 'verified'];

const list = (q: string | undefined) => (q ? q.split(',').filter(Boolean) : []);

/** The tasks of a view, before the filters. */
export function baseTasks(kind: ListKind, views: Map<string, TaskView>, me: string): TaskView[] {
  const all = [...views.values()].filter((v) => v.status !== 'deleted');
  if (kind === 'mine') return all.filter((v) => v.assignees.includes(me) && v.status !== 'verified');
  if (kind === 'review') return all.filter((v) => v.status === 'done');
  if (kind === 'created') return all.filter((v) => v.createdBy === me);
  return all;
}

export function TaskList({ kind }: { kind: ListKind }) {
  const app = useApp();
  const { views, search, route, setQuery, now, settings, me } = app;
  const q = route.query;
  const fTags = list(q.tags);
  const fWho = list(q.who);
  const fStatus = list(q.status) as Status[];
  const mode = q.view === 'table' ? 'table' : 'board';
  const sort = q.sort ?? (kind === 'mine' ? 'due' : 'created');
  const dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : kind === 'mine' || sort === 'due' || sort === 'title' ? 'asc' : 'desc';

  // Verified tasks stay forever, so they are hidden by default (owner, 2026-11-19).
  // The switch (verified=1) or the status filter "Zkontrolováno" shows them.
  const showVerified = q.verified === '1' || fStatus.includes('verified');
  const base = useMemo(() => baseTasks(kind, views, me.userId), [views, kind, me.userId]);
  const { shown, verifiedMatching } = useMemo(() => {
    const terms = queryTerms(q.q ?? '');
    const matching = base.filter(
      (v) =>
        (!fTags.length || v.tags.some((tg) => fTags.includes(tg.id))) &&
        (!fWho.length || fWho.some((w) => (w === 'none' ? v.assignees.length === 0 : v.assignees.includes(w)))) &&
        (!fStatus.length || fStatus.includes(v.status)) &&
        (!terms.length || matches(search.get(v.id) ?? '', terms)),
    );
    // N of the switch: the verified tasks that match all other filters (the same number in both states).
    const verifiedMatching = matching.filter((v) => v.status === 'verified').length;
    return { shown: showVerified ? matching : matching.filter((v) => v.status !== 'verified'), verifiedMatching };
  }, [base, q.tags, q.who, q.status, q.q, search, showVerified]);

  const sorted = useMemo(() => sortTasks(shown, sort, dir, app.userName, now, settings.dueSoonDays), [shown, sort, dir, now]);
  // The paging starts again at the first page when the filters, the search or the sort change.
  const pageKey = [kind, q.tags, q.who, q.status, q.q, q.verified, sort, dir].join('|');
  const active = fTags.length + fWho.length + fStatus.length + (q.q ? 1 : 0);
  const title = t(`nav.${kind}` as Key);

  return (
    <section class="page" aria-labelledby="page-title">
      <div class="page-head">
        <h1 id="page-title">
          {title} <span class="count">({nTasks(sorted.length)})</span>
        </h1>
        <div class="seg" role="group" aria-label={`${t('view.board')} / ${t('view.table')}`}>
          <button type="button" aria-pressed={mode === 'board'} onClick={() => setQuery({ view: undefined })}>
            {t('view.board')}
          </button>
          <button type="button" aria-pressed={mode === 'table'} onClick={() => setQuery({ view: 'table' })}>
            {t('view.table')}
          </button>
        </div>
      </div>
      <div class="row wrap filter-row">
        <Filters tags={fTags} who={fWho} status={fStatus} />
        {(kind === 'all' || kind === 'created') && !fStatus.includes('verified') && (
          <label class="toggle">
            <input type="checkbox" checked={q.verified === '1'} onChange={() => setQuery({ verified: q.verified === '1' ? undefined : '1' })} /> {t('filter.showVerified', { n: verifiedMatching })}
          </label>
        )}
      </div>
      {active > 0 && (
        <div class="chips" role="group" aria-label={t('filter.active')}>
          {q.q && <FilterChip label={`„${q.q}“`} onRemove={() => setQuery({ q: undefined })} />}
          {fTags.map((id) => (
            <FilterChip key={id} label={app.tags.find((x) => x.id === id)?.name ?? id} onRemove={() => setQuery({ tags: fTags.filter((x) => x !== id).join(',') || undefined })} />
          ))}
          {fWho.map((id) => (
            <FilterChip key={id} label={id === 'none' ? t('filter.unassigned') : app.userName(id)} onRemove={() => setQuery({ who: fWho.filter((x) => x !== id).join(',') || undefined })} />
          ))}
          {fStatus.map((s) => (
            <FilterChip key={s} label={statusLabel(s)} onRemove={() => setQuery({ status: fStatus.filter((x) => x !== s).join(',') || undefined })} />
          ))}
          <button type="button" class="link" onClick={() => setQuery({ q: undefined, tags: undefined, who: undefined, status: undefined })}>
            {t('filter.clear')}
          </button>
        </div>
      )}
      {sorted.length === 0 ? (
        <p class="empty">{active ? t('view.emptyFiltered') : t('view.empty')}</p>
      ) : mode === 'board' ? (
        <Board key={pageKey} tasks={sorted} columns={showVerified ? BOARD : BOARD.filter((s) => s !== 'verified')} />
      ) : (
        <Table key={pageKey} tasks={sorted} sort={sort} dir={dir} />
      )}
    </section>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span class="fchip">
      {label}
      <button type="button" class="chip-x" aria-label={t('filter.remove', { name: label })} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

function Filters({ tags, who, status }: { tags: string[]; who: string[]; status: Status[] }) {
  const app = useApp();
  const toggle = (key: 'tags' | 'who' | 'status', cur: string[], id: string) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    app.setQuery({ [key]: next.join(',') || undefined });
  };
  const users = [...app.users.values()].filter((u) => u.status === 'active').sort((a, b) => collator.compare(a.name, b.name));
  return (
    <div class="filters">
      <details class="dd">
        <summary>
          {t('filter.tags')} {tags.length > 0 && <span class="badge">{tags.length}</span>}
        </summary>
        <div class="dd-menu">
          {app.tags.map((tg) => (
            <label key={tg.id}>
              <input type="checkbox" checked={tags.includes(tg.id)} onChange={() => toggle('tags', tags, tg.id)} /> {tg.name}
            </label>
          ))}
        </div>
      </details>
      <details class="dd">
        <summary>
          {t('filter.assignees')} {who.length > 0 && <span class="badge">{who.length}</span>}
        </summary>
        <div class="dd-menu">
          <label>
            <input type="checkbox" checked={who.includes('none')} onChange={() => toggle('who', who, 'none')} /> <em>{t('filter.unassigned')}</em>
          </label>
          {users.map((u) => (
            <label key={u.id}>
              <input type="checkbox" checked={who.includes(u.id)} onChange={() => toggle('who', who, u.id)} /> {u.name}
            </label>
          ))}
        </div>
      </details>
      <details class="dd">
        <summary>
          {t('filter.status')} {status.length > 0 && <span class="badge">{status.length}</span>}
        </summary>
        <div class="dd-menu">
          {BOARD.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={status.includes(s)} onChange={() => toggle('status', status, s)} /> {statusLabel(s)}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function sortTasks(list: TaskView[], sort: string, dir: string, name: (id: string) => string, now: number, soonDays: number): TaskView[] {
  const sign = dir === 'desc' ? -1 : 1;
  const dueKey = (v: TaskView) => (v.due ? Date.parse(v.due.at) : Number.MAX_SAFE_INTEGER);
  const rank = (v: TaskView) => (dueState(v, now, soonDays) === 'overdue' ? 0 : 1);
  const cmp: Record<string, (a: TaskView, b: TaskView) => number> = {
    title: (a, b) => collator.compare(a.title, b.title),
    status: (a, b) => BOARD.indexOf(a.status) - BOARD.indexOf(b.status),
    assignees: (a, b) => collator.compare(a.assignees.map(name).join(', '), b.assignees.map(name).join(', ')),
    tags: (a, b) => collator.compare(a.tags.map((x) => x.name).join(', '), b.tags.map((x) => x.name).join(', ')),
    due: (a, b) => rank(a) - rank(b) || dueKey(a) - dueKey(b),
    created: (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0),
  };
  const c = cmp[sort] ?? cmp.created;
  return [...list].sort((a, b) => sign * c(a, b) || (a.id < b.id ? -1 : 1));
}

/** Cards of 1 board column and rows of the table that render at first (docs/performance.md). */
export const BOARD_PAGE = 100;
export const TABLE_PAGE = 200;

function Board({ tasks, columns }: { tasks: TaskView[]; columns: Status[] }) {
  // The number of shown cards for each column. "Zobrazit další" shows the next page.
  const [shown, setShown] = useState<Partial<Record<Status, number>>>({});
  return (
    <div class="board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(12rem, 1fr))` }}>
      {columns.map((s) => {
        const col = tasks.filter((v) => v.status === s);
        const n = shown[s] ?? BOARD_PAGE;
        return (
          <section key={s} class={`col col-${s}`} aria-label={statusLabel(s)}>
            <h2 class="col-head">
              <StatusBadge status={s} /> <span class="count">{col.length}</span>
            </h2>
            <ul class="cards">
              {col.slice(0, n).map((v) => (
                <li key={v.id}>
                  <Card v={v} />
                </li>
              ))}
            </ul>
            {col.length > n && (
              <button
                type="button"
                class="more"
                onClick={(e) => {
                  // The button can disappear (last page): the focus goes to the first new card.
                  const list = (e.currentTarget as HTMLElement).previousElementSibling;
                  setShown({ ...shown, [s]: n + BOARD_PAGE });
                  requestAnimationFrame(() => (list?.querySelectorAll<HTMLElement>('[data-task]')[n] ?? null)?.focus());
                }}
              >
                {nShowMore(Math.min(BOARD_PAGE, col.length - n))}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Card({ v }: { v: TaskView }) {
  const { route, now, settings } = useApp();
  const ds = dueState(v, now, settings.dueSoonDays);
  return (
    <a class={`card ${ds ?? ''}`} href={href(route.path, { ...route.query, task: v.id })} data-task={v.id}>
      <span class="card-title">{v.title}</span>
      {v.due && <DueLabel due={v.due} status={v.status} short />}
      {v.tags.length > 0 && (
        <span class="tags">
          {v.tags.map((tg) => (
            <TagChip key={tg.id} tag={tg} />
          ))}
        </span>
      )}
      <span class="card-foot">
        {v.subtasks.length > 0 && (
          <span class="meta" title={t('card.subtasks', { done: v.subtasksDone, total: v.subtasks.length })}>
            <span aria-hidden="true">☑ </span>
            <span class="sr-only">{t('card.subtasks', { done: v.subtasksDone, total: v.subtasks.length })}</span>
            <span aria-hidden="true">
              {v.subtasksDone}/{v.subtasks.length}
            </span>
          </span>
        )}
        {v.commentCount > 0 && (
          <span class="meta" title={t('card.comments', { n: v.commentCount })}>
            <span aria-hidden="true">💬 {v.commentCount}</span>
            <span class="sr-only">{t('card.comments', { n: v.commentCount })}</span>
          </span>
        )}
        {v.attachments.length > 0 && (
          <span class="meta" title={t('card.attachments', { n: v.attachments.length })}>
            <span aria-hidden="true">📎 {v.attachments.length}</span>
            <span class="sr-only">{t('card.attachments', { n: v.attachments.length })}</span>
          </span>
        )}
        <span class="avatars">
          {v.assignees.map((u) => (
            <Avatar key={u} userId={u} />
          ))}
        </span>
      </span>
    </a>
  );
}

function Table({ tasks, sort, dir }: { tasks: TaskView[]; sort: string; dir: string }) {
  const { route, setQuery, userName } = useApp();
  const [n, setN] = useState(TABLE_PAGE);
  const head = (key: string, label: Key) => {
    const on = sort === key;
    return (
      <th scope="col" aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" class="th" onClick={() => setQuery({ sort: key, dir: on && dir === 'asc' ? 'desc' : 'asc' })} aria-label={t('col.sortBy', { name: t(label) })}>
          {t(label)} {on ? (dir === 'asc' ? '▲' : '▼') : ''}
        </button>
      </th>
    );
  };
  return (
    <div class="table-box">
      <table class="tasks">
        <thead>
          <tr>
            {head('title', 'col.title')}
            {head('status', 'col.status')}
            {head('assignees', 'col.assignees')}
            {head('tags', 'col.tags')}
            {head('due', 'col.due')}
            {head('created', 'col.created')}
          </tr>
        </thead>
        <tbody>
          {tasks.slice(0, n).map((v) => (
            <tr key={v.id}>
              <td class="title-cell">
                <a href={href(route.path, { ...route.query, task: v.id })} data-task={v.id}>
                  {v.title}
                </a>
                {v.subtasks.length > 0 && (
                  <span class="meta" title={t('card.subtasks', { done: v.subtasksDone, total: v.subtasks.length })}>
                    {' '}
                    <span aria-hidden="true">☑ </span>
                    {v.subtasksDone}/{v.subtasks.length}
                  </span>
                )}
              </td>
              <td>
                <StatusBadge status={v.status} />
              </td>
              <td>{v.assignees.length ? v.assignees.map(userName).join(', ') : <span class="muted">{t('common.none')}</span>}</td>
              <td>
                {v.tags.map((tg) => (
                  <TagChip key={tg.id} tag={tg} />
                ))}
              </td>
              <td class="nowrap">{v.due ? <DueLabel due={v.due} status={v.status} short /> : ''}</td>
              <td class="nowrap">{v.createdAt ? fmtDate(v.createdAt) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length > n && (
        <button
          type="button"
          class="more"
          onClick={(e) => {
            const box = (e.currentTarget as HTMLElement).parentElement;
            setN(n + TABLE_PAGE);
            requestAnimationFrame(() => (box?.querySelectorAll<HTMLElement>('tbody [data-task]')[n] ?? null)?.focus());
          }}
        >
          {nShowMore(Math.min(TABLE_PAGE, tasks.length - n))}
        </button>
      )}
    </div>
  );
}
