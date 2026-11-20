// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Task detail panel (drawer). Each change is 1 op at once.
import { uuidv7, type AuditEntry, type Entity } from 'oplog-core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { downloadBytes, imageUrl, loadBlob, purgeBlobFile, PurgedBlobError, storeBlob } from '../app/files';
import { LIMITS, type Status } from '../domain/constants';
import { comparePos, keyBetween, planMove } from '../domain/fractional';
import { TRANSITIONS, STATUS_OPS, type StatusOp } from '../domain/status';
import { isBlockedFileName, downloadName, extensionOf, normalizeTagName } from '../domain/text';
import type { TaskView } from '../domain/view';
import { ChangeDetail, changeLabel, entityLabel, fieldText, RevertDialog, tasksOf, valueText, visibleWrites } from './audit';
import { focusTask, href, useApp } from './ctx';
import { DoneDialog, DeleteDialog, ResumeDialog, ReturnDialog } from './dialogs';
import { collator, fmtDateTime, nAttachmentsGen, nMoreWrites, fmtRelative, isoToInputs, opLabel, pragueToIso, t, type Key } from './i18n';
import { Markdown } from './Markdown';
import { Avatar, Dialog, DueLabel, Picker, StatusBadge, TagChip, useBusy } from './widgets';

export function TaskPanel({ id }: { id: string }) {
  const app = useApp();
  const v = app.views.get(id);
  const close = () => {
    app.setQuery({ task: undefined });
    focusTask(id);
  };
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), [id]);
  if (!v) {
    return (
      <aside class="drawer" tabIndex={-1} ref={ref} aria-label={t('task.notFound')}>
        <button type="button" class="drawer-x" onClick={close} aria-label={t('task.close')}>
          ×
        </button>
        <p>{t('task.notFound')}</p>
      </aside>
    );
  }
  const ro = v.status === 'verified' || v.status === 'deleted';
  return (
    <aside class="drawer" tabIndex={-1} ref={ref} aria-labelledby="task-title">
      <button type="button" class="drawer-x" onClick={close} aria-label={t('task.close')}>
        ×
      </button>
      <Header v={v} ro={ro} />
      {v.status === 'verified' && <p class="note">{t('task.readonly')}</p>}
      <Description v={v} ro={ro} />
      <Subtasks v={v} ro={ro} />
      <Files v={v} ro={ro} />
      <People v={v} ro={ro} />
      <Tags v={v} ro={ro} />
      <Tabs v={v} />
    </aside>
  );
}

// ---- Header ---------------------------------------------------------------------------------

function Header({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(v.title);
  const [dlg, setDlg] = useState<StatusOp | null>(null);
  useEffect(() => {
    if (!edit) setTitle(v.title);
  }, [v.title, edit]);
  const ops = STATUS_OPS.filter((op) => TRANSITIONS[op].from.includes(v.status) && app.check(op, statusPayload(op, v)) === 'applied');
  const run = async (op: StatusOp) => {
    if (op === 'CompleteTask' || op === 'ReturnTask' || op === 'DeleteTask' || op === 'ResumeTask') return setDlg(op);
    await app.act(op, { id: v.id, from: v.status });
  };
  const [busy, setBusy, isBusy] = useBusy();
  const save = async () => {
    const tt = title.trim();
    if (isBusy()) return;
    setBusy(true);
    // A refused write keeps the editor open, so the typed text is not lost.
    const r = tt && tt !== v.title ? await app.act('UpdateTask', { id: v.id, fields: { title: tt } }) : 'applied';
    setBusy(false);
    if (r !== 'rejected') setEdit(false);
  };
  return (
    <header class="task-head">
      {edit ? (
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input type="text" class="title-input" aria-label={t('task.title')} data-orig={v.title} value={title} maxLength={LIMITS.title} required onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
          <button type="submit" disabled={busy}>
            {t('task.save')}
          </button>
          <button type="button" class="link" onClick={() => (setTitle(v.title), setEdit(false))}>
            {t('task.cancel')}
          </button>
        </form>
      ) : (
        <h2 id="task-title" class="task-title">
          {v.title}
          {!ro && (
            <button type="button" class="link small" onClick={() => setEdit(true)}>
              {t('task.edit')}
            </button>
          )}
        </h2>
      )}
      <div class="row wrap">
        <StatusBadge status={v.status} />
        {ops.map((op) => (
          <button key={op} type="button" class={op === 'DeleteTask' ? 'danger' : op === 'CompleteTask' || op === 'VerifyTask' ? 'primary' : ''} onClick={() => run(op)}>
            {t(`act.${op}` as Key)}
          </button>
        ))}
      </div>
      <DueEditor v={v} ro={ro || v.status === 'postponed'} />
      <p class="muted small">{t('task.createdBy', { name: app.userName(v.createdBy), when: fmtRelative(v.createdAt, app.now) })}</p>
      {dlg === 'CompleteTask' && <DoneDialog v={v} onClose={() => setDlg(null)} />}
      {dlg === 'ReturnTask' && <ReturnDialog v={v} onClose={() => setDlg(null)} />}
      {dlg === 'DeleteTask' && <DeleteDialog v={v} onClose={() => setDlg(null)} />}
      {dlg === 'ResumeTask' && <ResumeDialog v={v} onClose={() => setDlg(null)} />}
    </header>
  );
}

function statusPayload(op: StatusOp, v: TaskView): Record<string, unknown> {
  const p: Record<string, unknown> = { id: v.id, from: v.status };
  if (op === 'ReturnTask') Object.assign(p, { commentId: 'check-only', text: 'x' });
  return p;
}

function DueEditor({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [edit, setEditRaw] = useState(false);
  // Read the current due date each time the editor opens (it can change while the panel is open).
  const setEdit = (on: boolean) => {
    if (on) {
      const cur = v.due ? isoToInputs(v.due.at) : { date: '', time: '' };
      setDate(cur.date);
      setTime(v.due && !v.due.allDay ? cur.time : '');
    }
    setEditRaw(on);
  };
  if (ro || !edit)
    return (
      <p class="row">
        <span class="label">{t('task.due')}:</span> <DueLabel due={v.due} status={v.status} />
        {!ro && (
          <button type="button" class="link small" onClick={() => setEdit(true)}>
            {t('task.edit')}
          </button>
        )}
      </p>
    );
  const save = async (clear = false) => {
    const due = clear || !date ? null : { at: pragueToIso(date, time || null), allDay: !time };
    await app.act('UpdateTask', { id: v.id, fields: { due } });
    setEdit(false);
  };
  return (
    <form
      class="row wrap"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label>
        {t('task.due')} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      <label>
        {t('task.dueTime')} <input type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
      </label>
      <button type="submit">{t('task.save')}</button>
      {v.due && (
        <button type="button" onClick={() => save(true)}>
          {t('task.dueClear')}
        </button>
      )}
      <button type="button" class="link" onClick={() => setEdit(false)}>
        {t('task.cancel')}
      </button>
    </form>
  );
}

// ---- Description ----------------------------------------------------------------------------

function Description({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy, isBusy] = useBusy();
  const [text, setText] = useState(v.description);
  useEffect(() => {
    if (!edit) setText(v.description);
  }, [v.description, edit]);
  return (
    <section class="sec" aria-labelledby="sec-desc">
      <h3 id="sec-desc">
        {t('task.description')}
        {!ro && !edit && (
          <button type="button" class="link small" onClick={() => setEdit(true)}>
            {t('task.edit')}
          </button>
        )}
      </h3>
      {edit ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isBusy()) return;
            setBusy(true);
            const r = text !== v.description ? await app.act('UpdateTask', { id: v.id, fields: { description: text } }) : 'applied';
            setBusy(false);
            if (r !== 'rejected') setEdit(false);
          }}
        >
          <textarea rows={6} aria-label={t('task.description')} data-orig={v.description} value={text} maxLength={LIMITS.description} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          <div class="row">
            <button type="submit">{t('task.save')}</button>
            <button type="button" class="link" onClick={() => (setText(v.description), setEdit(false))}>
              {t('task.cancel')}
            </button>
          </div>
        </form>
      ) : v.description ? (
        <Markdown text={v.description} />
      ) : (
        <p class="muted">{t('task.descriptionEmpty')}</p>
      )}
    </section>
  );
}

// ---- Subtasks -----------------------------------------------------------------------------------

function Subtasks({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const items = v.subtasks.map((s) => ({ id: s.id, pos: String(s.pos) })).sort(comparePos);
  const move = async (id: string, to: number) => {
    const ch = planMove(items, id, to);
    if (ch.length === 1) await app.act('MoveSubtask', { id: ch[0].id, pos: ch[0].pos });
    else await app.act('Batch', { ops: ch.map((c) => ({ type: 'MoveSubtask', payload: { id: c.id, pos: c.pos } })) });
  };
  const [busy, setBusy, isBusy] = useBusy();
  const add = async () => {
    const s = text.trim();
    if (!s || isBusy()) return;
    setBusy(true);
    const last = items.length ? items[items.length - 1].pos : null;
    if ((await app.act('AddSubtask', { id: uuidv7(), taskId: v.id, text: s, pos: keyBetween(last, null) })) === 'applied') setText('');
    setBusy(false);
  };
  return (
    <section class="sec" aria-labelledby="sec-sub">
      <h3 id="sec-sub">
        {t('task.subtasks')} {v.subtasks.length > 0 && <span class="count">{v.subtasksDone}/{v.subtasks.length}</span>}
      </h3>
      <ul class="subtasks">
        {v.subtasks.map((s, i) => (
          <li key={s.id}>
            <label class="check">
              <input type="checkbox" checked={s.done === true} disabled={ro} onChange={(e) => app.act('CheckSubtask', { id: s.id, done: (e.target as HTMLInputElement).checked })} />
              {editing === s.id ? null : <span class={s.done ? 'done-text' : ''}>{String(s.text)}</span>}
            </label>
            {editing === s.id && (
              <form
                class="row grow"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = editText.trim() && editText.trim() !== s.text ? await app.act('EditSubtask', { id: s.id, text: editText.trim() }) : 'applied';
                  if (r !== 'rejected') setEditing(null);
                }}
              >
                <input type="text" aria-label={t('task.subtaskEdit')} data-orig={String(s.text)} value={editText} maxLength={LIMITS.subtask} onInput={(e) => setEditText((e.target as HTMLInputElement).value)} />
                <button type="submit">{t('task.save')}</button>
              </form>
            )}
            {!ro && editing !== s.id && (
              <span class="row-actions">
                <button type="button" class="icon" disabled={i === 0} onClick={() => move(s.id, i - 1)} aria-label={t('task.subtaskUp')} title={t('task.subtaskUp')}>
                  ↑
                </button>
                <button type="button" class="icon" disabled={i === v.subtasks.length - 1} onClick={() => move(s.id, i + 1)} aria-label={t('task.subtaskDown')} title={t('task.subtaskDown')}>
                  ↓
                </button>
                <button type="button" class="icon" onClick={() => (setEditing(s.id), setEditText(String(s.text)))} aria-label={t('task.subtaskEdit')} title={t('task.subtaskEdit')}>
                  ✎
                </button>
                <button type="button" class="icon" onClick={() => app.act('RemoveSubtask', { id: s.id })} aria-label={t('task.subtaskRemove')} title={t('task.subtaskRemove')}>
                  🗑
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!ro && (
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input type="text" aria-label={t('task.subtaskAdd')} placeholder={t('task.subtaskAdd')} value={text} maxLength={LIMITS.subtask} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <button type="submit" disabled={busy} aria-label={t('task.subtaskAdd')}>
            +
          </button>
        </form>
      )}
    </section>
  );
}

// ---- Attachments and links ---------------------------------------------------------------------

function Files({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [link, setLink] = useState<{ url: string; title: string } | null>(null);
  const [linkBusy, setLinkBusy, isLinkBusy] = useBusy();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    if (isBlockedFileName(f.name)) return app.toast(t('task.fileBlocked'), 'error');
    if (f.size > app.settings.maxAttachmentMB * 1024 * 1024) return app.toast(t('task.fileTooBig', { mb: app.settings.maxAttachmentMB }), 'error');
    try {
      const purged = (sha: string) => app.engine.state.scopes.data?.blob?.[sha]?.purged === true;
      const sha256 = await storeBlob(app.storage, new Uint8Array(await f.arrayBuffer()), purged);
      await app.act('AddAttachment', { id: uuidv7(), taskId: v.id, sha256, name: f.name.slice(0, LIMITS.fileName), mime: (f.type || 'application/octet-stream').slice(0, LIMITS.mime), size: f.size });
    } catch (e) {
      if (e instanceof PurgedBlobError) app.toast(t('task.filePurgedUpload'), 'error');
      else app.toast(t('msg.writeFailed', { reason: (e as Error).message }), 'error');
    }
  };
  return (
    <section class="sec" aria-labelledby="sec-files">
      <h3 id="sec-files">{t('task.files')}</h3>
      <ul class="files">
        {v.attachments.map((a) => (
          <Attachment key={a.id} a={a} ro={ro} />
        ))}
        {v.links.map((l) => (
          <li key={l.id}>
            <span aria-hidden="true">🔗 </span>
            <a href={String(l.url)} target="_blank" rel="noopener noreferrer">
              {String(l.title || l.url)}
            </a>
            {!ro && (
              <button type="button" class="icon" onClick={() => app.act('RemoveLink', { id: l.id })} aria-label={t('task.linkRemove')} title={t('task.linkRemove')}>
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>
      {!ro && (
        <div class="row wrap">
          <input ref={fileInput} type="file" class="sr-only" tabIndex={-1} aria-hidden="true" aria-label={t('task.fileAdd')} onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            (e.target as HTMLInputElement).value = '';
            if (f) void upload(f);
          }} />
          <button type="button" onClick={() => fileInput.current?.click()}>
            + {t('task.fileAdd')}
          </button>
          <button type="button" onClick={() => setLink({ url: '', title: '' })}>
            + {t('task.linkAdd')}
          </button>
        </div>
      )}
      {link && (
        <form
          class="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (isLinkBusy()) return;
            setLinkBusy(true);
            const r = await app.act('AddLink', { id: uuidv7(), taskId: v.id, url: link.url.trim(), title: link.title.trim() });
            setLinkBusy(false);
            if (r === 'applied') setLink(null);
          }}
        >
          <label>
            {t('task.linkUrl')}
            <input type="url" required value={link.url} maxLength={LIMITS.url} onInput={(e) => setLink({ ...link, url: (e.target as HTMLInputElement).value })} />
          </label>
          <label>
            {t('task.linkTitle')}
            <input type="text" value={link.title} maxLength={LIMITS.linkTitle} onInput={(e) => setLink({ ...link, title: (e.target as HTMLInputElement).value })} />
          </label>
          <div class="row">
            <button type="submit">{t('task.save')}</button>
            <button type="button" class="link" onClick={() => setLink(null)}>
              {t('task.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

function Attachment({ a, ro }: { a: Entity; ro: boolean }) {
  const app = useApp();
  const purged = app.engine.state.scopes.data?.blob?.[String(a.sha256)]?.purged === true;
  const [thumb, setThumb] = useState<string | null>(null);
  const [problem, setProblem] = useState<'missing' | 'bad' | null>(null);
  const [purging, setPurging] = useState(false);
  const name = String(a.name);
  const txt = downloadName(name) !== name.replace(/[. ]+$/, '') && extensionOf(name) !== null;
  useEffect(() => {
    if (purged || !/^image\/(png|jpeg|gif|webp)$/.test(String(a.mime)) || Number(a.size) > 5 * 1024 * 1024) return;
    let url: string | null = null;
    let live = true;
    void loadBlob(app.storage, String(a.sha256)).then((r) => {
      if (!r.ok) return;
      url = imageUrl(r.bytes);
      if (live) setThumb(url);
      else if (url) URL.revokeObjectURL(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [a.sha256, purged]);
  const download = async () => {
    const r = await loadBlob(app.storage, String(a.sha256));
    if (!r.ok) return setProblem(r.reason);
    downloadBytes(r.bytes, name);
  };
  return (
    <li>
      <span aria-hidden="true">{thumb ? '' : '📎 '}</span>
      {thumb && <img class="thumb" src={thumb} alt="" />}
      <span>{name}</span> <span class="muted small">({kb(Number(a.size))})</span>
      {purged ? (
        <span class="muted"> – {t('task.filePurged')}</span>
      ) : (
        <button type="button" class="small" onClick={download} title={txt ? t('task.fileWarnTxt') : undefined}>
          {t('task.download')}
        </button>
      )}
      {problem && <span class="error small"> {t(problem === 'missing' ? 'task.fileMissing' : 'task.fileBad')}</span>}
      {!ro && (
        <button type="button" class="icon" onClick={() => app.act('RemoveAttachment', { id: a.id })} aria-label={t('task.fileRemove')} title={t('task.fileRemove')}>
          🗑
        </button>
      )}
      {app.isAdmin && !purged && (
        <button type="button" class="link small danger-link" onClick={() => setPurging(true)}>
          {t('task.filePurge')}
        </button>
      )}
      {purging && <PurgeDialog sha256={String(a.sha256)} name={name} onClose={() => setPurging(false)} />}
    </li>
  );
}

/**
 * Purge of an attachment file (admins, data-model §11): a PurgeBlob op, then the file in
 * data/files/ is deleted. All attachments with the same content show "odstraněno". Permanent.
 */
function PurgeDialog({ sha256, name, onClose }: { sha256: string; name: string; onClose: () => void }) {
  const app = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy, isBusy] = useBusy();
  const uses = Object.values(app.engine.state.scopes.data?.attachment ?? {}).filter((x) => x.sha256 === sha256 && x.status === 'active').length;
  const purge = async () => {
    if (isBusy() || !reason.trim()) return;
    setBusy(true);
    if ((await app.act('PurgeBlob', { sha256, reason: reason.trim() })) !== 'rejected') {
      // The op is the decision. The delete of the file can fail (for example a OneDrive lock):
      // then other clients still do not open the file, and the admin deletes it by hand (the
      // button is gone after the purge). "missing": the file is not on this computer (not synced).
      let r: Awaited<ReturnType<typeof purgeBlobFile>> = 'failed';
      try {
        r = await purgeBlobFile(app.storage, sha256);
      } catch {
        /* r stays 'failed' */
      }
      if (r === 'failed') app.toast(t('task.filePurgeDeleteFailed', { path: `data/files/${sha256}` }), 'error');
      onClose();
    } else setBusy(false);
  };
  return (
    <Dialog title={t('task.filePurge')} onClose={onClose}>
      <p>{t('task.filePurgeText', { name, n: nAttachmentsGen(uses) })}</p>
      <p class="warn">{t('task.filePurgeWarn')}</p>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void purge();
        }}
      >
        <label>
          {t('task.filePurgeReason')} *
          <input type="text" required autoFocus maxLength={LIMITS.reason} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
        </label>
        <div class="row end">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="submit" class="danger" disabled={busy || !reason.trim()}>
            {t('task.filePurge')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---- Assignees and tags ---------------------------------------------------------------------------

function People({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [pick, setPick] = useState(false);
  const items = [...app.users.values()].filter((u) => u.status === 'active' && !v.assignees.includes(u.id)).sort((a, b) => collator.compare(a.name, b.name)).map((u) => ({ id: u.id, label: u.name }));
  return (
    <section class="sec" aria-labelledby="sec-people">
      <h3 id="sec-people">{t('task.assignees')}</h3>
      <div class="row wrap">
        {v.assignees.map((u) => (
          <span key={u} class="person">
            <Avatar userId={u} /> {app.userName(u)}
            {!ro && (
              <button type="button" class="chip-x" onClick={() => app.act('RemoveAssignee', { taskId: v.id, userId: u })} aria-label={t('task.assigneeRemove', { name: app.userName(u) })}>
                ×
              </button>
            )}
          </span>
        ))}
        {!ro && !pick && (
          <button type="button" class="small" onClick={() => setPick(true)}>
            + {t('task.assigneeAdd')}
          </button>
        )}
      </div>
      {pick && <Picker items={items} label={t('task.assigneeAdd')} onPick={(id) => app.act('AddAssignee', { taskId: v.id, userId: id })} onClose={() => setPick(false)} />}
    </section>
  );
}

function Tags({ v, ro }: { v: TaskView; ro: boolean }) {
  const app = useApp();
  const [pick, setPick] = useState(false);
  const items = app.tags.filter((tg) => !v.tags.some((x) => x.id === tg.id)).map((tg) => ({ id: tg.id, label: tg.name }));
  const create = async (name: string) => {
    const existing = app.tags.find((tg) => normalizeTagName(tg.name) === normalizeTagName(name));
    if (existing) return void app.act('AddTaskTag', { taskId: v.id, tagId: existing.id });
    const id = uuidv7();
    await app.act('Batch', { ops: [{ type: 'CreateTag', payload: { id, name } }, { type: 'AddTaskTag', payload: { taskId: v.id, tagId: id } }] });
  };
  return (
    <section class="sec" aria-labelledby="sec-tags">
      <h3 id="sec-tags">{t('task.tags')}</h3>
      <div class="row wrap">
        {v.tags.map((tg) => (
          <TagChip key={tg.id} tag={tg} onRemove={ro ? undefined : () => app.act('RemoveTaskTag', { taskId: v.id, tagId: tg.id })} />
        ))}
        {!ro && !pick && (
          <button type="button" class="small" onClick={() => setPick(true)}>
            + {t('task.tagAdd')}
          </button>
        )}
      </div>
      {pick && <Picker items={items} label={t('task.tagAdd')} create={create} onPick={(id) => app.act('AddTaskTag', { taskId: v.id, tagId: id })} onClose={() => setPick(false)} />}
    </section>
  );
}

// ---- Conversation and history --------------------------------------------------------------------

function Tabs({ v }: { v: TaskView }) {
  const [tab, setTab] = useState<'c' | 'h'>('c');
  const app = useApp();
  const history = useMemo(() => taskHistory(app, v.id), [app.version, v.id]);
  return (
    <section class="sec">
      <div
        class="tabs"
        role="tablist"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          const next = tab === 'c' ? 'h' : 'c';
          setTab(next);
          (document.getElementById(`tab-${next}`) as HTMLElement | null)?.focus();
        }}
      >
        <button type="button" id="tab-c" role="tab" aria-selected={tab === 'c'} aria-controls={tab === 'c' ? 'panel-c' : undefined} tabIndex={tab === 'c' ? 0 : -1} onClick={() => setTab('c')}>
          {t('task.conversation')} <span class="count">{v.commentCount}</span>
        </button>
        <button type="button" id="tab-h" role="tab" aria-selected={tab === 'h'} aria-controls={tab === 'h' ? 'panel-h' : undefined} tabIndex={tab === 'h' ? 0 : -1} onClick={() => setTab('h')}>
          {t('task.history')} <span class="count">{history.length}</span>
        </button>
      </div>
      {tab === 'c' ? <Conversation v={v} /> : <History entries={history} taskId={v.id} />}
    </section>
  );
}

/** Mentions: active users whose name follows "@" in the text. */
export function mentionsIn(text: string, users: { id: string; name: string; status: string }[]): string[] {
  // The name must end at a word boundary: "@Eva Nováková" must not mention "Eva Nová".
  return users
    .filter((u) => u.status === 'active')
    .filter((u) => {
      for (let i = text.indexOf(`@${u.name}`); i >= 0; i = text.indexOf(`@${u.name}`, i + 1)) {
        const after = text[i + u.name.length + 1];
        if (after === undefined || !/[\p{L}\p{N}]/u.test(after)) return true;
      }
      return false;
    })
    .map((u) => u.id);
}

function Conversation({ v }: { v: TaskView }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const users = [...app.users.values()];
  const [busy, setBusy, isBusy] = useBusy();
  const send = async () => {
    const s = text.trim();
    if (!s || isBusy()) return;
    setBusy(true);
    if ((await app.act('AddComment', { id: uuidv7(), taskId: v.id, text: s, mentions: mentionsIn(s, users) })) === 'applied') setText('');
    setBusy(false);
  };
  return (
    <div role="tabpanel" id="panel-c" aria-labelledby="tab-c">
      <ul class="comments">
        {v.comments.map((c) =>
          c.status === 'deleted' ? (
            <li key={c.id} class="muted small">
              {t('task.commentDeleted')}
            </li>
          ) : (
            <li key={c.id} class={c.kind === 'return' ? 'return' : ''}>
              <div class="comment-head">
                <Avatar userId={String(c.createdBy)} /> <strong>{app.userName(String(c.createdBy))}</strong>{' '}
                <span class="muted small" title={`${fmtDateTime(String(c.createdAt))} (${t('common.selfReported')})`}>
                  {fmtRelative(String(c.createdAt), app.now)}
                </span>
                {c.editedAt ? <span class="muted small"> · {t('task.commentEdited')}</span> : null}
                {c.kind === 'return' && <span class="tagline"> · {t('act.ReturnTask')}</span>}
                {v.status !== 'deleted' && (c.createdBy === app.me.userId || app.isAdmin) && editing !== c.id && (
                  <span class="row-actions">
                    <button type="button" class="link small" onClick={() => (setEditing(c.id), setEditText(String(c.text)))}>
                      {t('task.commentEdit')}
                    </button>
                    <button type="button" class="link small" onClick={() => app.act('DeleteComment', { id: c.id })}>
                      {t('task.commentDelete')}
                    </button>
                  </span>
                )}
              </div>
              {editing === c.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = editText.trim() && editText !== c.text ? await app.act('EditComment', { id: c.id, text: editText.trim(), mentions: mentionsIn(editText, users) }) : 'applied';
                    if (r !== 'rejected') setEditing(null);
                  }}
                >
                  <textarea rows={3} aria-label={t('task.commentEdit')} data-orig={String(c.text)} value={editText} maxLength={LIMITS.comment} onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)} />
                  <div class="row">
                    <button type="submit">{t('task.save')}</button>
                    <button type="button" class="link" onClick={() => setEditing(null)}>
                      {t('task.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <Markdown text={String(c.text)} />
              )}
            </li>
          ),
        )}
      </ul>
      {v.status !== 'deleted' && (
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            rows={3}
            aria-label={t('task.commentPlaceholder')}
            placeholder={t('task.commentPlaceholder')}
            value={text}
            maxLength={LIMITS.comment}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div class="row">
            <button type="submit" class="primary" disabled={busy}>
              {t('task.commentSend')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The audit entries that touch the task (its fields or its children), the newest first. */
export function taskHistory(app: ReturnType<typeof useApp>, id: string): AuditEntry[] {
  const st = app.engine.state;
  return app.engine.audit.filter((a) => tasksOf(st, a).has(id)).reverse();
}

/** 1 line of a change: "Název: Starý → Nový", or "Podúkol „…“: splněno: ne → ano" for a child. */
function changeLines(app: ReturnType<typeof useApp>, a: AuditEntry, taskId: string): string[] {
  const st = app.engine.state;
  return visibleWrites(a.writes).map((w) => {
    const field = fieldText(w.f, w.e);
    const what = w.e === 'task' && w.id === taskId ? field.charAt(0).toUpperCase() + field.slice(1) : `${entityLabel(st, a.scope, w.e, w.id, app.userName, false)}: ${field}`;
    const before = w.existed ? valueText(st, w.f, w.before, app.userName, w.e) : '—';
    return `${what}: ${before} → ${valueText(st, w.f, w.v, app.userName, w.e)}`;
  });
}

function History({ entries, taskId }: { entries: AuditEntry[]; taskId: string }) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [revert, setRevert] = useState<AuditEntry | null>(null);
  return (
    <div role="tabpanel" id="panel-h" aria-labelledby="tab-h">
      <p class="muted small">{t('task.historyIntro')}</p>
      <ol class="history">
        {entries.map((a) => {
          const lines = changeLines(app, a, taskId);
          const isOpen = open === a.opId;
          return (
            <li key={a.opId} class={a.status}>
              <span class="muted small" title={t('common.selfReported')}>
                {fmtDateTime(a.wallTime)}
              </span>{' '}
              <strong>{app.userName(a.userId ?? '')}</strong> ·{' '}
              <button type="button" class="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.opId)}>
                {changeLabel(a)}
              </button>
              {a.status !== 'applied' && <span class={`hist-status ${a.status}`}> · {t(`audit.${a.status}` as Key)}</span>}
              {app.isAdmin && a.status === 'applied' && (
                <button type="button" class="small hist-revert" onClick={() => setRevert(a)}>
                  {t('revert.button')}
                </button>
              )}
              {lines.length > 0 && (
                <ul>
                  {lines.slice(0, isOpen ? lines.length : 6).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                  {!isOpen && lines.length > 6 && <li class="muted">{nMoreWrites(lines.length - 6)}</li>}
                </ul>
              )}
              {isOpen && (
                <>
                  <ChangeDetail a={a} />
                  {app.isAdmin && (
                    <a class="small" href={href(['admin', 'audit'], { task: taskId })}>
                      {t('task.historyAudit')}
                    </a>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      {revert && <RevertDialog entry={revert} onClose={() => setRevert(null)} />}
    </div>
  );
}
