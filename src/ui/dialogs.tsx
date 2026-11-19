// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Dialogs: new task and status changes that need input or a confirmation.
import { uuidv7 } from 'oplog-core';
import { useState } from 'preact/hooks';

/** Runs an async action only 1 time at a time (no double submit). */
function useOnce(): [boolean, (f: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy, isBusy] = useBusy();
  const run = async (f: () => Promise<void>) => {
    if (isBusy()) return;
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}
import { LIMITS } from '../domain/constants';
import type { TaskView } from '../domain/view';
import { href, useApp } from './ctx';
import { collator, isoToInputs, pragueToIso, t } from './i18n';
import { Dialog, TagChip, useBusy } from './widgets';

function DueInputs({ date, time, setDate, setTime }: { date: string; time: string; setDate: (s: string) => void; setTime: (s: string) => void }) {
  return (
    <div class="row wrap">
      <label>
        {t('task.due')} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      <label>
        {t('task.dueTime')} <input type="time" value={time} disabled={!date} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
      </label>
    </div>
  );
}

const dueOf = (date: string, time: string) => (date ? { at: pragueToIso(date, time || null), allDay: !time } : null);

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>(app.settings.defaultTags.filter((id) => app.tags.some((x) => x.id === id)));
  const users = [...app.users.values()].filter((u) => u.status === 'active').sort((a, b) => collator.compare(a.name, b.name));
  const [busy, once] = useOnce();
  const submit = () => once(async () => {
    const id = uuidv7();
    const due = dueOf(date, time);
    const ops = [
      { type: 'CreateTask', payload: { id, title: title.trim(), ...(desc.trim() ? { description: desc } : {}), ...(due ? { due } : {}) } },
      ...who.map((u) => ({ type: 'AddAssignee', payload: { taskId: id, userId: u } })),
      ...tags.map((tg) => ({ type: 'AddTaskTag', payload: { taskId: id, tagId: tg } })),
    ];
    if ((await app.act('Batch', { ops })) === 'applied') {
      onClose();
      app.nav(href(app.route.path, { ...app.route.query, task: id }));
    }
  });
  return (
    <Dialog title={t('dlg.new.title')} onClose={onClose} wide>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void submit();
        }}
      >
        <label>
          {t('task.title')} *
          <input type="text" required autoFocus maxLength={LIMITS.title} value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          {t('task.description')}
          <textarea rows={4} maxLength={LIMITS.description} value={desc} onInput={(e) => setDesc((e.target as HTMLTextAreaElement).value)} />
        </label>
        <DueInputs date={date} time={time} setDate={setDate} setTime={setTime} />
        <fieldset>
          <legend>{t('task.assignees')}</legend>
          <div class="checks">
            {users.map((u) => (
              <label key={u.id}>
                <input type="checkbox" checked={who.includes(u.id)} onChange={() => setWho(who.includes(u.id) ? who.filter((x) => x !== u.id) : [...who, u.id])} /> {u.name}
              </label>
            ))}
          </div>
        </fieldset>
        {app.tags.length > 0 && (
          <fieldset>
            <legend>{t('task.tags')}</legend>
            <div class="checks">
              {app.tags.map((tg) => (
                <label key={tg.id}>
                  <input type="checkbox" checked={tags.includes(tg.id)} onChange={() => setTags(tags.includes(tg.id) ? tags.filter((x) => x !== tg.id) : [...tags, tg.id])} /> <TagChip tag={tg} />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div class="row end">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {t('dlg.new.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DoneDialog({ v, onClose }: { v: TaskView; onClose: () => void }) {
  const app = useApp();
  const [busy, once] = useOnce();
  // Fixed when the dialog opens: a poll must not change it.
  const [nowIn] = useState(() => isoToInputs(new Date(Date.now()).toISOString()));
  const [date, setDate] = useState(nowIn.date);
  const [time, setTime] = useState(nowIn.time);
  const open = v.subtasks.length - v.subtasksDone;
  return (
    <Dialog title={t('dlg.done.title')} onClose={onClose}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void once(async () => {
          const completedAt = pragueToIso(date, time || '00:00');
          const changed = date !== nowIn.date || time !== nowIn.time;
          if ((await app.act('CompleteTask', { id: v.id, from: v.status, ...(changed ? { completedAt } : {}) })) !== 'rejected') onClose();
          });
        }}
      >
        {open > 0 && <p class="warn">{t('dlg.done.open', { n: open, total: v.subtasks.length })}</p>}
        <div class="row wrap">
          <label>
            {t('dlg.done.date')} <input type="date" required value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            <span class="sr-only">{t('task.dueTime')}</span>
            <input type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <div class="row end">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {t('act.CompleteTask')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReturnDialog({ v, onClose }: { v: TaskView; onClose: () => void }) {
  const app = useApp();
  const [busy, once] = useOnce();
  const [text, setText] = useState('');
  return (
    <Dialog title={t('dlg.return.title')} onClose={onClose}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void once(async () => {
          if (!text.trim()) return;
          if ((await app.act('ReturnTask', { id: v.id, from: v.status, commentId: uuidv7(), text: text.trim() })) !== 'rejected') onClose();
          });
        }}
      >
        <label>
          {t('task.returnReason')} *
          <textarea rows={4} required autoFocus maxLength={LIMITS.comment} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        </label>
        <div class="row end">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {t('act.ReturnTask')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteDialog({ v, onClose }: { v: TaskView; onClose: () => void }) {
  const app = useApp();
  const [busy, once] = useOnce();
  return (
    <Dialog title={t('dlg.delete.title')} onClose={onClose}>
      <p>{t('dlg.delete.text', { title: v.title })}</p>
      <div class="row end">
        <button type="button" onClick={onClose} autoFocus>
          {t('dlg.cancel')}
        </button>
        <button
          type="button"
          class="danger"
          disabled={busy}
          onClick={() =>
            once(async () => {
              if ((await app.act('DeleteTask', { id: v.id, from: v.status })) !== 'rejected') {
                onClose();
                app.setQuery({ task: undefined });
              }
            })
          }
        >
          {t('act.DeleteTask')}
        </button>
      </div>
    </Dialog>
  );
}

export function ResumeDialog({ v, onClose }: { v: TaskView; onClose: () => void }) {
  const app = useApp();
  const [busy, once] = useOnce();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  return (
    <Dialog title={t('dlg.resume.title')} onClose={onClose}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void once(async () => {
          const due = dueOf(date, time);
          if ((await app.act('ResumeTask', { id: v.id, from: v.status, ...(due ? { due } : {}) })) !== 'rejected') onClose();
          });
        }}
      >
        <p class="muted">{t('dlg.resume.due')}</p>
        <DueInputs date={date} time={time} setDate={setDate} setTime={setTime} />
        <div class="row end">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {t('act.ResumeTask')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
