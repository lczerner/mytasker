// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Admin screens. The UI hides them from other users; authorize() is the real gate.
import { fingerprint, listEnrollments, uuidv7, type EnrollmentEntry } from 'oplog-core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DATA, ENROLL_FORMAT, LIMITS, ROLES, SETTING_RANGES, type Settings } from '../domain/constants';
import { href, useApp } from './ctx';
import { collator, fmtDateTime, fmtRelative, nFiles, nOpenTasksLoc, nTasks, opLabel, t, type Key } from './i18n';
import { Dialog, TagChip, useBusy } from './widgets';

export function AdminPage({ page }: { page: string }) {
  const app = useApp();
  if (!app.isAdmin) return <p class="page">{t('admin.notAllowed')}</p>;
  switch (page) {
    case 'users':
      return <Users />;
    case 'enroll':
      return <Enrollments />;
    case 'tags':
      return <TagsAdmin />;
    case 'settings':
      return <SettingsAdmin />;
    case 'checkpoints':
      return <Checkpoints />;
    case 'trash':
      return <Trash />;
    case 'audit':
      return <Audit />;
    case 'integrity':
      return <Integrity />;
    default:
      return <Users />;
  }
}

// ---- Users -------------------------------------------------------------------------------------

function Users() {
  const app = useApp();
  const [removing, setRemoving] = useState<string | null>(null);
  const users = [...app.users.values()].sort((a, b) => (a.status === b.status ? collator.compare(a.name, b.name) : a.status === 'active' ? -1 : 1));
  const keys = Object.values(app.engine.state.scopes.roles?.key ?? {});
  return (
    <section class="page">
      <h1>{t('admin.users')}</h1>
      <div class="table-box">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('admin.user')}</th>
              <th scope="col">{t('admin.role')}</th>
              <th scope="col">{t('admin.verifier')}</th>
              <th scope="col">{t('admin.keys')}</th>
              <th scope="col">{t('admin.status')}</th>
              <th scope="col">
                <span class="sr-only">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const own = keys.filter((k) => k.userId === u.id);
              const fixed = u.root || u.status !== 'active';
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {u.root && <span class="muted small"> · {t('admin.root')}</span>}
                  </td>
                  <td>{u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                  <td>{u.verifier ? t('common.yes') : t('common.no')}</td>
                  <td class="small">
                    {own.map((k) => (
                      <div key={k.id}>
                        <code>{fingerprint(k.id)}</code>
                        {k.cutoff ? <span class="muted"> ({t('admin.keyRevoked')})</span> : null}
                      </div>
                    ))}
                  </td>
                  <td>{u.status === 'active' ? t('admin.active') : t('admin.removed')}</td>
                  <td class="actions">
                    {!fixed && (
                      <>
                        <button type="button" class="small" onClick={() => app.act('SetRole', { userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' }, ROLES)}>
                          {u.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin')}
                        </button>
                        <button type="button" class="small" onClick={() => app.act('SetVerifier', { userId: u.id, verifier: !u.verifier }, ROLES)}>
                          {u.verifier ? t('admin.verifierOff') : t('admin.verifierOn')}
                        </button>
                        <button type="button" class="small danger" onClick={() => setRemoving(u.id)}>
                          {t('admin.remove')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {removing && <RemoveUserDialog userId={removing} onClose={() => setRemoving(null)} />}
    </section>
  );
}

function RemoveUserDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const app = useApp();
  const name = app.userName(userId);
  const open = [...app.views.values()].filter((v) => v.assignees.includes(userId) && !['done', 'verified', 'deleted'].includes(v.status));
  const [busy, setBusy, isBusy] = useBusy();
  const remove = async (alsoTasks: boolean) => {
    if (isBusy()) return;
    setBusy(true);
    // The cutoff of each key: its highest known seq in each scope. Later ops of the key are invalid.
    const cutoffs: Record<string, { roles: number; data: number }> = {};
    for (const k of Object.values(app.engine.state.scopes.roles?.key ?? {}))
      if (k.userId === userId) {
        const seq = (scope: string) => app.engine.validHeads().find((h) => h.keyId === k.id && h.scope === scope)?.seq ?? 0;
        cutoffs[k.id] = { roles: seq(ROLES), data: seq(DATA) };
      }
    if ((await app.act('RemoveUser', { userId, cutoffs }, ROLES)) !== 'applied') return setBusy(false);
    if (alsoTasks && open.length) await app.act('Batch', { ops: open.map((v) => ({ type: 'RemoveAssignee', payload: { taskId: v.id, userId } })) });
    onClose();
  };
  return (
    <Dialog title={t('admin.remove')} onClose={onClose}>
      <p>{t('admin.removeConfirm', { name })}</p>
      {open.length > 0 && <p>{t('admin.removeTasks', { tasks: nOpenTasksLoc(open.length) })}</p>}
      <div class="row end wrap">
        <button type="button" onClick={onClose}>
          {t('dlg.cancel')}
        </button>
        <button type="button" onClick={() => remove(false)}>
          {t('admin.removeOnly')}
        </button>
        {open.length > 0 && (
          <button type="button" class="danger" onClick={() => remove(true)}>
            {t('admin.removeAlsoTasks')}
          </button>
        )}
      </div>
    </Dialog>
  );
}

// ---- Enrollment requests ---------------------------------------------------------------------------

function Enrollments() {
  const app = useApp();
  const [list, setList] = useState<EnrollmentEntry[] | null>(null);
  useEffect(() => {
    void listEnrollments(app.storage, ENROLL_FORMAT)
      .then(setList)
      .catch(() => setList([]));
  }, [app.version]);
  const keys = app.engine.state.scopes.roles?.key ?? {};
  const active = [...app.users.values()].filter((u) => u.status === 'active').sort((a, b) => collator.compare(a.name, b.name));
  return (
    <section class="page">
      <h1>{t('admin.enroll')}</h1>
      <p class="note">{t('admin.enrollCompare')}</p>
      {list === null ? (
        <p class="muted">{t('gate.loading')}</p>
      ) : list.length === 0 ? (
        <p class="empty">{t('admin.enrollNone')}</p>
      ) : (
        <ul class="enroll-list">
          {list.map((e) => (
            <EnrollItem key={e.path} e={e} done={!!(e.request && keys[e.request.keyId])} users={active} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EnrollItem({ e, done, users }: { e: EnrollmentEntry; done: boolean; users: { id: string; name: string }[] }) {
  const app = useApp();
  const [target, setTarget] = useState('new');
  const [busy, setBusy, isBusy] = useBusy();
  const r = e.request;
  if (!r || !e.valid)
    return (
      <li class="enroll invalid">
        <code>{e.path}</code> – {t('admin.enrollInvalid')}
      </li>
    );
  const approve = async () => {
    if (isBusy()) return;
    setBusy(true);
    if (target === 'new') await app.act('GrantUser', { userId: uuidv7(), displayName: r.displayName.slice(0, LIMITS.displayName), keyId: r.keyId, publicKey: r.publicKey, role: 'user', verifier: false }, ROLES);
    else await app.act('AddKey', { userId: target, keyId: r.keyId, publicKey: r.publicKey }, ROLES);
    setBusy(false);
  };
  return (
    <li class={`enroll ${done ? 'done' : ''}`}>
      <div>
        <strong>{r.displayName}</strong> <span class="muted small">({fmtRelative(r.createdAt, app.now)})</span>
      </div>
      <div class="fingerprint" aria-label={t('admin.fingerprint')}>
        {fingerprint(r.keyId)}
      </div>
      {done ? (
        <span class="muted">{t('admin.enrollDone')}</span>
      ) : (
        <div class="row wrap">
          <label>
            <span class="sr-only">{t('admin.enrollAs')}</span>
            <select value={target} onChange={(ev) => setTarget((ev.target as HTMLSelectElement).value)}>
              <option value="new">{t('admin.enrollNewUser')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {t('admin.enrollNewKey', { name: u.name })}
                </option>
              ))}
            </select>
          </label>
          <button type="button" class="primary" disabled={busy} onClick={approve}>
            {t('admin.enrollApprove')}
          </button>
        </div>
      )}
    </li>
  );
}

// ---- Tags -------------------------------------------------------------------------------------------

function TagsAdmin() {
  const app = useApp();
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [merge, setMerge] = useState<string | null>(null);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of app.views.values()) if (v.status !== 'deleted') for (const tg of v.tags) m.set(tg.id, (m.get(tg.id) ?? 0) + 1);
    return m;
  }, [app.version]);
  return (
    <section class="page">
      <h1>{t('admin.tags')}</h1>
      <div class="table-box">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('col.tags')}</th>
              <th scope="col">{t('admin.tagCount')}</th>
              <th scope="col">
                <span class="sr-only">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {app.tags.map((tg) => (
              <tr key={tg.id}>
                <td>
                  {rename?.id === tg.id ? (
                    <form
                      class="row"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if ((await app.act('RenameTag', { id: tg.id, name: rename.name.trim() })) !== 'rejected') setRename(null);
                      }}
                    >
                      <input type="text" aria-label={t('admin.tagRename')} value={rename.name} maxLength={LIMITS.tagName} onInput={(e) => setRename({ ...rename, name: (e.target as HTMLInputElement).value })} />
                      <button type="submit">{t('task.save')}</button>
                      <button type="button" class="link" onClick={() => setRename(null)}>
                        {t('task.cancel')}
                      </button>
                    </form>
                  ) : (
                    <TagChip tag={tg} />
                  )}
                </td>
                <td>{counts.get(tg.id) ?? 0}</td>
                <td class="actions">
                  <button type="button" class="small" onClick={() => setRename({ id: tg.id, name: tg.name })}>
                    {t('admin.tagRename')}
                  </button>
                  <button type="button" class="small" onClick={() => setMerge(tg.id)}>
                    {t('admin.tagMerge')}
                  </button>
                  <button type="button" class="small danger" onClick={() => setDel(tg)}>
                    {t('admin.tagDelete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {del && (
        <Dialog title={t('admin.tagDelete')} onClose={() => setDel(null)}>
          <p>{t('admin.tagDeleteConfirm', { name: del.name })}</p>
          <div class="row end">
            <button type="button" onClick={() => setDel(null)}>
              {t('dlg.cancel')}
            </button>
            <button type="button" class="danger" onClick={async () => (await app.act('DeleteTag', { id: del.id }), setDel(null))}>
              {t('admin.tagDelete')}
            </button>
          </div>
        </Dialog>
      )}
      {merge && (
        <Dialog title={t('admin.tagMerge')} onClose={() => setMerge(null)}>
          <ul class="pick-list">
            {app.tags
              .filter((x) => x.id !== merge)
              .map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={async () => (await app.act('MergeTag', { id: merge, into: x.id }), setMerge(null))}>
                    {x.name}
                  </button>
                </li>
              ))}
          </ul>
        </Dialog>
      )}
    </section>
  );
}

// ---- Settings ---------------------------------------------------------------------------------------

function SettingsAdmin() {
  const app = useApp();
  const [s, setS] = useState<Settings>(app.settings);
  const [dirty, setDirty] = useState(false);
  // A change by another admin updates the form only if this admin has no unsaved edits.
  // Not on the first render: the state has the settings already, and a late effect could
  // overwrite a value that the user typed in the meantime.
  const seen = useRef(app.version);
  useEffect(() => {
    if (seen.current === app.version) return;
    seen.current = app.version;
    if (!dirty) setS(app.settings);
  }, [app.version]);
  const change = (next: Settings) => {
    setS(next);
    setDirty(true);
  };
  const save = async () => {
    for (const k of Object.keys(s) as (keyof Settings)[]) {
      if (JSON.stringify(s[k]) === JSON.stringify(app.settings[k])) continue;
      if ((await app.act('SetSetting', { key: k, value: s[k] }, ROLES)) === 'rejected') return;
    }
    setDirty(false);
    app.toast(t('msg.saved'), 'ok');
  };
  return (
    <section class="page">
      <h1>{t('admin.settings')}</h1>
      <form
        class="stack narrow"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {(Object.keys(SETTING_RANGES) as (keyof typeof SETTING_RANGES)[]).map((k) => (
          <label key={k}>
            {t(`admin.set.${k}` as Key)}
            <input type="number" min={SETTING_RANGES[k][0]} max={SETTING_RANGES[k][1]} required value={s[k]} onInput={(e) => change({ ...s, [k]: Number((e.target as HTMLInputElement).value) })} />
          </label>
        ))}
        <fieldset>
          <legend>{t('admin.set.defaultTags')}</legend>
          <div class="checks">
            {app.tags.map((tg) => (
              <label key={tg.id}>
                <input type="checkbox" checked={s.defaultTags.includes(tg.id)} onChange={() => change({ ...s, defaultTags: s.defaultTags.includes(tg.id) ? s.defaultTags.filter((x) => x !== tg.id) : [...s.defaultTags, tg.id] })} /> {tg.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div class="row">
          <button type="submit" class="primary">
            {t('task.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---- Checkpoints -----------------------------------------------------------------------------------

function Checkpoints() {
  const app = useApp();
  const stats = app.engine.checkpointStats([ROLES, DATA]);
  const [busy, setBusy, isBusy] = useBusy();
  const make = async (scope: string) => {
    if (isBusy()) return;
    setBusy(true);
    try {
      await app.engine.createCheckpoint(app.me.signer, scope);
      app.toast(t('msg.saved'), 'ok');
      await app.refresh('quick');
    } catch (e) {
      console.warn(e);
      app.toast(t('gate.errorGeneric'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="page">
      <h1>{t('admin.checkpoints')}</h1>
      <p class="note">{t('admin.cpText')}</p>
      <ul class="cp-list">
        {stats.map((s) => (
          <li key={s.scope}>
            <strong>{t(`admin.scope.${s.scope}` as Key)}</strong>: {t('admin.cpStats', { files: nFiles(s.opFiles), outside: s.notInCheckpoint })}
            {s.lastCheckpoint && <span class="muted small"> · {fmtDateTime(s.lastCheckpoint)}</span>}{' '}
            <button type="button" class="small" disabled={busy || s.packable === 0} onClick={() => make(s.scope)}>
              {t('admin.cpCreate', { scope: t(`admin.scope.${s.scope}` as Key) })}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Trash -------------------------------------------------------------------------------------------

function Trash() {
  const app = useApp();
  const deleted = [...app.views.values()].filter((v) => v.status === 'deleted').sort((a, b) => ((a.deletedAt ?? '') < (b.deletedAt ?? '') ? 1 : -1));
  return (
    <section class="page">
      <h1>
        {t('admin.trash')} <span class="count">({nTasks(deleted.length)})</span>
      </h1>
      {deleted.length === 0 ? (
        <p class="empty">{t('admin.trashEmpty')}</p>
      ) : (
        <ul class="trash">
          {deleted.map((v) => (
            <li key={v.id}>
              <a href={href(['admin', 'trash'], { task: v.id })}>{v.title}</a>{' '}
              <span class="muted small">{t('admin.deletedBy', { name: app.userName(v.deletedBy), when: v.deletedAt ? fmtRelative(v.deletedAt, app.now) : '' })}</span>{' '}
              <button type="button" class="small" onClick={() => app.act('RestoreTask', { id: v.id, from: 'deleted' })}>
                {t('act.RestoreTask')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Audit and integrity (basic lists; Phase 5 adds filters and revert) ----------------------------

function Audit() {
  const app = useApp();
  const rows = app.engine.audit.slice(-300).reverse();
  return (
    <section class="page">
      <h1>{t('admin.audit')}</h1>
      <div class="table-box">
        <table class="audit">
          <thead>
            <tr>
              <th scope="col">{t('admin.colTime')}</th>
              <th scope="col">{t('admin.user')}</th>
              <th scope="col">{t('admin.colChange')}</th>
              <th scope="col">{t('admin.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.opId} class={a.status}>
                <td class="nowrap" title={t('common.selfReported')}>
                  {fmtDateTime(a.wallTime)}
                </td>
                <td>{app.userName(a.userId)}</td>
                <td>
                  {opLabel(a.type)}
                  {a.itemTypes && a.type === 'Batch' ? <span class="muted small"> ({a.itemTypes.map(opLabel).join(', ')})</span> : null}
                </td>
                <td>{t(`audit.${a.status}` as Key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Integrity() {
  const app = useApp();
  const issues = app.engine.issues;
  return (
    <section class="page">
      <h1>{t('admin.integrity')}</h1>
      {issues.length === 0 ? (
        <p class="empty">{t('admin.integrityOk')}</p>
      ) : (
        <ul class="issues">
          {issues.map((i, n) => (
            <li key={n}>
              <strong>{t(`issue.${i.kind}` as Key)}</strong> {i.path && <span class="muted small">· {i.path}</span>}
              {i.authorKeyId && <span class="muted small"> · {app.userName(app.engine.domain.keyOwner(app.engine.state, i.authorKeyId))}</span>}
              <details class="small">
                <summary>{t('admin.techDetail')}</summary>
                <code>
                  {i.kind}: {i.detail}
                </code>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

