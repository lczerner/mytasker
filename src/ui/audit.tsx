// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Audit, revert and integrity: the admin pages, and the Czech description of a change
// (also for the history of a task).
import { canonicalize, planRevert, type AppliedWrite, type AuditEntry, type Issue, type OpMeta, type RevertPlan, type State, type Write } from 'oplog-core';
import { Fragment } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { DATA, ROLES, type Status } from '../domain/constants';
import { href, useApp, type AppCtx } from './ctx';
import { AUDIT_TEXT, FIELD_TEXT, fmtDateTime, nMoreWrites, nShowMore, nShownChanges, opLabel, pragueToIso, STATUS_OTHER, statusLabel, t, type Key } from './i18n';
import { Dialog, useBusy } from './widgets';

// ---- Description of a change ----------------------------------------------------------------------

type Ent = Record<string, unknown> | undefined;
const entOf = (st: State, scope: string, e: string, id: string): Ent => (st.scopes[scope] as Record<string, Record<string, Ent>> | undefined)?.[e]?.[id];
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The Czech name of an entity: "Úkol „Objednat toner“", "Podúkol „…“", "Uživatel Eva Nová". */
/** `withTask` false leaves out the task of a child (the task history shows only 1 task). */
export function entityLabel(st: State, scope: string, e: string, id: string, userName: (id: string) => string, withTask = true): string {
  const x = entOf(st, scope, e, id);
  const task = (tid: unknown) => {
    if (!withTask) return '';
    const tk = entOf(st, DATA, 'task', String(tid));
    return tk ? t('ent.ofTask', { title: `„${short(String(tk.title ?? ''), 40)}“` }) : '';
  };
  const tagName = (tid: unknown) => String(entOf(st, DATA, 'tag', String(tid))?.name ?? tid);
  switch (e) {
    case 'task':
      return `${t('ent.task')} ${x ? `„${short(String(x.title ?? ''))}“` : id}`;
    case 'subtask':
      return `${t('ent.subtask')} „${short(String(x?.text ?? id), 40)}“ ${x ? task(x.taskId) : ''}`.trim();
    case 'comment':
      return `${t('ent.comment')} ${x ? task(x.taskId) : id}`.trim();
    case 'attachment':
      return `${t('ent.attachment')} „${short(String(x?.name ?? id), 40)}“ ${x ? task(x.taskId) : ''}`.trim();
    case 'link':
      return `${t('ent.link')} „${short(String(x?.title || x?.url || id), 40)}“ ${x ? task(x.taskId) : ''}`.trim();
    case 'assignee': {
      const [tid, uid] = id.split('/');
      return `${t('ent.assignee')} ${userName(uid)} ${task(tid)}`.trim();
    }
    case 'taskTag': {
      const [tid, gid] = id.split('/');
      return `${t('ent.taskTag')} „${tagName(gid)}“ ${task(tid)}`.trim();
    }
    case 'tag':
      return `${t('ent.tag')} „${String(x?.name ?? id)}“`;
    case 'blob':
      return `${t('ent.blob')} ${id.slice(0, 12)}…`;
    case 'user':
      return `${t('ent.user')} ${x ? String(x.displayName ?? id) : id}`;
    case 'key':
      return `${t('ent.key')} ${id.slice(0, 12)}… ${x?.userId ? `(${userName(String(x.userId))})` : ''}`.trim();
    case 'setting':
      return `${t('ent.setting')} „${SETTING_KEYS.includes(id) ? t(`admin.set.${id}` as Key) : id}“`;
    default:
      return `${e} ${id}`;
  }
}

/** True if the field has an entry in the Czech table (tests). */
export const knownField = (f: string): boolean => f in FIELD_TEXT;
export const fieldText = (f: string, e?: string): string => ((e === 'assignee' || e === 'taskTag') && f === 'on' ? AUDIT_TEXT.onField : f in FIELD_TEXT ? FIELD_TEXT[f] : f);
const SETTING_KEYS = ['dueSoonDays', 'pollSeconds', 'maxAttachmentMB', 'defaultTags'];

/** The Czech label of an op: for a Batch, its items ("Vytvoření úkolu, 3× Přidání řešitele"). */
export function changeLabel(a: AuditEntry): string {
  if (a.type !== 'Batch' || !a.itemTypes?.length) return opLabel(a.type);
  const n = new Map<string, number>();
  for (const x of a.itemTypes) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].map(([x, k]) => (k > 1 ? `${k}× ${opLabel(x)}` : opLabel(x))).join(', ');
}

/** A value in Czech: status labels, user names, dates, tag names, yes/no. */
export function valueText(st: State, f: string, v: unknown, userName: (id: string) => string, e?: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (f === 'on' && e === 'assignee') return v ? AUDIT_TEXT.assigneeOn : AUDIT_TEXT.assigneeOff;
  if (f === 'on' && e === 'taskTag') return v ? AUDIT_TEXT.tagOn : AUDIT_TEXT.tagOff;
  if (f === 'status' || f === 'statusBeforeDelete') {
    const s = String(v);
    return ['new', 'assigned', 'postponed', 'done', 'verified', 'deleted'].includes(s) ? statusLabel(s as Status) : (STATUS_OTHER[s] ?? s);
  }
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (f === 'role') return v === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser');
  if (f.endsWith('By') || f === 'by') return userName(String(v));
  if (f === 'due' && typeof v === 'object') return fmtDateTime(String((v as { at: string }).at), Boolean((v as { allDay: boolean }).allDay));
  if ((f.endsWith('At') || f === 'at') && typeof v === 'string') return fmtDateTime(v);
  if (f === 'mentions' && Array.isArray(v)) return v.map((x) => userName(String(x))).join(', ') || '—';
  if (f === 'mergedInto') return `„${String(entOf(st, DATA, 'tag', String(v))?.name ?? v)}“`;
  if (f === 'size' && typeof v === 'number') return `${Math.max(1, Math.round(v / 1024))} ${AUDIT_TEXT.kB}`;
  if (typeof v === 'object') return short(canonicalize(v), 120);
  return short(String(v), 120);
}

/** Visible writes: no technical fields, no ID fields. */
export const visibleWrites = <W extends Write>(writes: readonly W[]): W[] => writes.filter((w) => fieldText(w.f, w.e) !== '');

/** Distinct entities of an op, in the order of the writes. */
export function entitiesOf(a: AuditEntry): { e: string; id: string }[] {
  const seen = new Set<string>();
  const out: { e: string; id: string }[] = [];
  for (const w of a.writes) {
    const k = `${w.e}|${w.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ e: w.e, id: w.id });
  }
  return out;
}

const CHILDREN = ['subtask', 'comment', 'attachment', 'link'];

/** The task IDs that an op touches (fields of the task, or its children). */
export function tasksOf(st: State, a: AuditEntry): Set<string> {
  const out = new Set<string>();
  if (a.scope !== DATA) return out;
  for (const w of a.writes) {
    if (w.e === 'task') out.add(w.id);
    else if (w.e === 'assignee' || w.e === 'taskTag') out.add(w.id.split('/')[0]);
    else {
      const tid = entOf(st, DATA, w.e, w.id)?.taskId;
      if (typeof tid === 'string') out.add(tid);
    }
  }
  const items = a.type === 'Batch' && Array.isArray(a.payload.ops) ? (a.payload.ops as { payload?: Record<string, unknown> }[]).map((o) => o.payload ?? {}) : [a.payload];
  for (const p of items) {
    if (typeof p.taskId === 'string') out.add(p.taskId);
    else if (typeof p.id === 'string') {
      if (entOf(st, DATA, 'task', p.id)) out.add(p.id);
      // An op on a child with only its ID (EditComment, CheckSubtask, Remove…), also without effect.
      else
        for (const e of CHILDREN) {
          const tid = entOf(st, DATA, e, p.id)?.taskId;
          if (typeof tid === 'string') out.add(tid);
        }
    }
  }
  return out;
}

// ---- Revert -------------------------------------------------------------------------------------------

/** The plan of a Revert of `a` by the current user, or a Czech reason why it is not possible. */
export function revertPlan(app: AppCtx, a: AuditEntry): RevertPlan | { error: string; tech?: string } {
  if (!app.isAdmin) return { error: t('revert.adminOnly') };
  if (a.status !== 'applied') return { error: t('revert.notApplied') };
  const now = Date.now();
  const meta: OpMeta = { opId: 'plan', scope: a.scope, authorKeyId: app.me.keyId, userId: app.me.userId, seq: 1, hlc: { t: now, c: 0 }, wallTime: new Date(now).toISOString(), envType: 'Revert', item: 0 };
  const p = planRevert(app.engine.result, a.opId, app.engine.domain, meta, app.engine.validKeyBindings);
  if ('error' in p) return { error: /cannot be reverted/.test(p.error) ? t('revert.notRevertible') : t('revert.notPossible'), tech: p.error };
  return p;
}

export function RevertDialog({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const app = useApp();
  const [busy, setBusy, isBusy] = useBusy();
  // Planned again after each change of the data, so the warning is never out of date.
  const plan = useMemo(() => revertPlan(app, entry), [app.version]);
  const openVersion = useRef(app.version);
  const st = app.engine.state;
  const name = app.userName;
  const err = 'error' in plan ? plan : null;
  const p = plan as RevertPlan;
  const check = err ? null : app.check('Revert', p.payload as unknown as Record<string, unknown>, entry.scope);
  const ok = !err && check !== 'rejected';
  const run = async () => {
    if (isBusy()) return;
    setBusy(true);
    try {
      if ((await app.act('Revert', p.payload as unknown as Record<string, unknown>, entry.scope)) !== 'rejected') onClose();
      // A rejected write renders again (new version), but the data did not change.
      else openVersion.current = app.version + 1;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('revert.title')} onClose={onClose} wide>
      <p>
        {t('revert.what', { what: changeLabel(entry), who: name(entry.userId ?? ''), when: fmtDateTime(entry.wallTime) })}
      </p>
      {app.version !== openVersion.current && <p class="warn">{t('revert.changed')}</p>}
      {err ? (
        <p class="warn">
          {err.error}
          {err.tech && <span class="muted small"> ({err.tech})</span>}
        </p>
      ) : (
        <>
          {check === 'rejected' && <p class="warn">{t('revert.rejected')}</p>}
          {p.overwritten.length > 0 ? (
            <>
              <p class="warn">{t('revert.overwritten')}</p>
              <div class="table-box">
                <table class="diff small">
                  <thead>
                    <tr>
                      <th scope="col">{t('audit.colEntity')}</th>
                      <th scope="col">{t('audit.colField')}</th>
                      <th scope="col">{t('revert.colNow')}</th>
                      <th scope="col">{t('revert.colTarget')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWrites(p.overwritten.map((o) => ({ ...o, v: o.targetValue }))).map((o, i) => (
                      <tr key={i}>
                        <td>{entityLabel(st, entry.scope, o.e, o.id, name)}</td>
                        <td>{fieldText(o.f, o.e)}</td>
                        <td class="after">{valueText(st, o.f, o.currentValue, name, o.e)}</td>
                        <td>{valueText(st, o.f, o.targetValue, name, o.e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>{t('revert.noConflict')}</p>
          )}
          <p class="muted small">{t('revert.result')}</p>
          <div class="table-box">
            <table class="diff small">
              <thead>
                <tr>
                  <th scope="col">{t('audit.colEntity')}</th>
                  <th scope="col">{t('audit.colField')}</th>
                  <th scope="col">{t('revert.colNew')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleWrites(p.writes)
                  .slice(0, 100)
                  .map((w, i) => (
                    <tr key={i}>
                      <td>{entityLabel(st, entry.scope, w.e, w.id, name)}</td>
                      <td>{fieldText(w.f, w.e)}</td>
                      <td class="after">{valueText(st, w.f, w.v, name, w.e)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div class="row end">
        <button type="button" onClick={onClose} autoFocus>
          {t('dlg.cancel')}
        </button>
        <button type="button" class="danger" disabled={!ok || busy} onClick={() => void run()}>
          {t('revert.do')}
        </button>
      </div>
    </Dialog>
  );
}

// ---- Details of 1 change (audit and task history) -----------------------------------------------

/** The detail of 1 op: technical data and a table of the writes (before → after). */
export function ChangeDetail({ a }: { a: AuditEntry }) {
  const app = useApp();
  const st = app.engine.state;
  const name = app.userName;
  const writes = visibleWrites(a.writes as AppliedWrite[]);
  return (
    <div class="change-detail">
      <p class="muted small">
        {t('audit.scope')}: {a.scope === ROLES ? t('audit.scopeRoles') : t('audit.scopeData')} · {t('audit.key')} <span class="mono">{a.authorKeyId.slice(0, 12)}…</span> · {t('audit.seq')} {a.seq} ·{' '}
        <span class="mono" title={a.opId}>
          {a.opId.slice(0, 13)}…
        </span>{' '}
        · {t('audit.sigOk')}
      </p>
      {a.reason && (
        <p class="small">
          {t('audit.reason')}: <span class="muted">{a.reason}</span>
        </p>
      )}
      {a.notes.length > 0 && (
        <ul class="small">
          {a.notes.map((n, i) => (
            <li key={i}>
              {opLabel(n.type)}: {t(`audit.${n.status}` as Key)} <span class="muted">({n.reason})</span>
            </li>
          ))}
        </ul>
      )}
      {writes.length > 0 ? (
        <div class="table-box">
          <table class="diff small">
            <thead>
              <tr>
                <th scope="col">{t('audit.colEntity')}</th>
                <th scope="col">{t('audit.colField')}</th>
                <th scope="col">{t('audit.colBefore')}</th>
                <th scope="col">{t('audit.colAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {writes.slice(0, 300).map((w, i) => (
                <tr key={i}>
                  <td>{entityLabel(st, a.scope, w.e, w.id, name)}</td>
                  <td>{fieldText(w.f, w.e)}</td>
                  <td class="before">{w.existed ? valueText(st, w.f, w.before, name, w.e) : '—'}</td>
                  <td class="after">{valueText(st, w.f, w.v, name, w.e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {writes.length > 300 && <p class="muted small">{nMoreWrites(writes.length - 300)}</p>}
        </div>
      ) : null}
      {/* Always available: the technical content, for example the IDs for docs/operations.md §4.1. */}
      <details class="small" open={writes.length === 0}>
        <summary>{t('audit.payload')}</summary>
        <pre class="diff-json">{JSON.stringify(a.payload, null, 1).slice(0, 4000)}</pre>
      </details>
    </div>
  );
}

// ---- Audit page -------------------------------------------------------------------------------------

const PAGE = 100;

export function AuditPage() {
  const app = useApp();
  const st = app.engine.state;
  const q = app.route.query;
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [revert, setRevert] = useState<AuditEntry | null>(null);
  const all = useMemo(() => [...app.engine.audit].reverse(), [app.version]);
  const users = useMemo(() => [...new Set(all.map((a) => a.userId).filter((x): x is string => !!x))].sort((a, b) => app.userName(a).localeCompare(app.userName(b), 'cs')), [all]);
  const types = useMemo(() => [...new Set(all.flatMap((a) => [a.type, ...(a.itemTypes && a.type === 'Batch' ? a.itemTypes : [])]))].sort((a, b) => opLabel(a).localeCompare(opLabel(b), 'cs')), [all]);
  const text = (q.q ?? '').trim().toLocaleLowerCase('cs');
  // The search text of each change, computed 1 time for each version of the audit (not on each key press).
  const hay = useMemo(() => new Map<string, string>(), [all]);
  const hayOf = (a: AuditEntry) => {
    let h = hay.get(a.opId);
    if (h === undefined) {
      h = [a.opId, changeLabel(a), app.userName(a.userId ?? ''), ...entitiesOf(a).map((x) => entityLabel(st, a.scope, x.e, x.id, app.userName))].join(' ').toLocaleLowerCase('cs');
      hay.set(a.opId, h);
    }
    return h;
  };
  // The date range in Prague time, as UTC times (1 conversion, not 1 for each change).
  // "Do" includes the whole day: up to the start of the next day (23:59:59 + 1 s), exclusive.
  const fromMs = q.from ? Date.parse(pragueToIso(q.from, '00:00')) : -Infinity;
  const toMs = q.to ? Date.parse(pragueToIso(q.to, null)) + 1000 : Infinity;
  const list = useMemo(
    () =>
      all.filter((a) => {
        if (q.user && a.userId !== q.user) return false;
        if (q.type && a.type !== q.type && !(a.type === 'Batch' && a.itemTypes?.includes(q.type))) return false;
        if (q.status && a.status !== q.status) return false;
        const ms = Date.parse(a.wallTime);
        if (ms < fromMs || ms >= toMs) return false;
        if (q.task && !tasksOf(st, a).has(q.task)) return false;
        if (text && !hayOf(a).includes(text)) return false;
        return true;
      }),
    [all, q.user, q.type, q.status, fromMs, toMs, q.task, text],
  );
  const set = (k: string) => (e: Event) => {
    setLimit(PAGE);
    app.setQuery({ [k]: (e.target as HTMLInputElement).value || undefined });
  };
  const taskTitle = q.task ? (app.views.get(q.task)?.title ?? q.task) : '';
  return (
    <section class="page">
      <h1>{t('admin.audit')}</h1>
      <p class="muted small">{t('audit.intro')}</p>
      <div class="toolbar row wrap">
        <input type="search" aria-label={t('audit.search')} placeholder={t('audit.search')} value={q.q ?? ''} onInput={set('q')} />
        <select aria-label={t('audit.fUser')} value={q.user ?? ''} onChange={set('user')}>
          <option value="">{t('audit.fUser')}: {t('audit.any')}</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {app.userName(u)}
            </option>
          ))}
        </select>
        <select aria-label={t('audit.fType')} value={q.type ?? ''} onChange={set('type')}>
          <option value="">{t('audit.fType')}: {t('audit.any')}</option>
          {types.map((x) => (
            <option key={x} value={x}>
              {opLabel(x)}
            </option>
          ))}
        </select>
        <select aria-label={t('audit.fStatus')} value={q.status ?? ''} onChange={set('status')}>
          <option value="">{t('audit.fStatus')}: {t('audit.any')}</option>
          {(['applied', 'no-effect', 'superseded', 'rejected'] as const).map((x) => (
            <option key={x} value={x}>
              {t(`audit.${x}` as Key)}
            </option>
          ))}
        </select>
        <label class="row small">
          {t('audit.from')} <input type="date" value={q.from ?? ''} onInput={set('from')} />
        </label>
        <label class="row small">
          {t('audit.to')} <input type="date" value={q.to ?? ''} onInput={set('to')} />
        </label>
      </div>
      {q.task && (
        <p class="chips">
          <span class="chip">
            {t('audit.fTask')}: {taskTitle}{' '}
            <button type="button" class="chip-x" aria-label={t('audit.fTaskRemove')} onClick={() => app.setQuery({ task: undefined })}>
              ×
            </button>
          </span>
        </p>
      )}
      <p class="muted small">{nShownChanges(list.length, all.length)}</p>
      {list.length === 0 ? (
        <p class="empty">{t('audit.none')}</p>
      ) : (
        <div class="table-box">
          <table class="audit">
            <thead>
              <tr>
                <th scope="col">{t('admin.colTime')}</th>
                <th scope="col">{t('admin.user')}</th>
                <th scope="col">{t('admin.colChange')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">
                  <span class="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((a) => {
                const ents = entitiesOf(a);
                const isOpen = open === a.opId;
                const tasks = [...tasksOf(st, a)];
                return (
                  <Fragment key={a.opId}>
                    <tr class={a.status}>
                      <td class="nowrap" title={t('common.selfReported')}>
                        {fmtDateTime(a.wallTime)}
                      </td>
                      <td>{app.userName(a.userId ?? '')}</td>
                      <td>
                        <button type="button" class="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.opId)}>
                          {changeLabel(a)}
                        </button>
                        <div class="small muted wrap-anywhere">
                          {ents
                            .slice(0, 3)
                            .map((x) => entityLabel(st, a.scope, x.e, x.id, app.userName))
                            .join('; ')}
                          {ents.length > 3 ? ` … +${ents.length - 3}` : ''}
                        </div>
                        {a.revertOf && <div class="small muted">{t('audit.revertOf', { id: a.revertOf.slice(0, 13) })}</div>}
                        {tasks.length === 1 && app.views.has(tasks[0]) && (
                          <a class="small" href={href(['admin', 'audit'], { ...q, task: tasks[0] })}>
                            {t('audit.onlyTask')}
                          </a>
                        )}
                      </td>
                      <td>
                        <span class={`audit-st ${a.status}`}>{t(`audit.${a.status}` as Key)}</span>
                        {a.notes.length > 0 && <div class="small muted">{t('audit.notes', { n: a.notes.length })}</div>}
                      </td>
                      <td class="actions">
                        {a.status === 'applied' && (
                          <button type="button" class="small" onClick={() => setRevert(a)}>
                            {t('revert.button')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr class="detail-row">
                        <td colSpan={5}>
                          <ChangeDetail a={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 200)}>
          {nShowMore(Math.min(200, list.length - limit))}
        </button>
      )}
      {revert && <RevertDialog entry={revert} onClose={() => setRevert(null)} />}
    </section>
  );
}

// ---- Integrity page -------------------------------------------------------------------------------

export function IntegrityPage() {
  const app = useApp();
  const issues = app.engine.issues;
  const groups = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) {
      const l = m.get(i.kind);
      if (l) l.push(i);
      else m.set(i.kind, [i]);
    }
    return [...m];
  }, [issues]);
  const author = (i: Issue) => (i.authorKeyId ? app.userName(app.engine.domain.keyOwner(app.engine.state, i.authorKeyId) ?? '') : '');
  return (
    <section class="page">
      <h1>{t('admin.integrity')}</h1>
      {issues.length === 0 ? (
        <p class="empty">{t('admin.integrityOk')}</p>
      ) : (
        <>
          <p class="muted small">{t('integrity.intro')}</p>
          {groups.map(([kind, list]) => (
            <section class="issue-group" key={kind}>
              <h2>
                {t(`issue.${kind}` as Key)} <span class="count">({list.length})</span>
              </h2>
              <p class="advice">{t(`advice.${kind}` as Key)}</p>
              <ul class="issues">
                {list.slice(0, 50).map((i, n) => (
                  <li key={n}>
                    {i.path && <span class="mono small">{i.path}</span>}
                    {i.authorKeyId && (
                      <span class="small">
                        {' '}
                        · {t('integrity.author')}: {author(i)}
                      </span>
                    )}
                    {i.seq !== undefined && (
                      <span class="small muted">
                        {' '}
                        · {t('audit.seq')} {i.seq}
                      </span>
                    )}
                    <details class="small">
                      <summary>{t('admin.techDetail')}</summary>
                      <code class="wrap-anywhere">
                        {i.kind}: {i.detail}
                        {i.opId ? ` (opId ${i.opId})` : ''}
                      </code>
                    </details>
                  </li>
                ))}
              </ul>
              {list.length > 50 && <p class="muted small">{t('integrity.more', { n: list.length - 50 })}</p>}
            </section>
          ))}
        </>
      )}
    </section>
  );
}
