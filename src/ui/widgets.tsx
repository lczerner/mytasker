// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Small shared components.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Status } from '../domain/constants';
import { fold } from '../domain/text';
import { dueState, type Due } from '../domain/view';
import { STATUS_ICON, useApp } from './ctx';
import { fmtDateTime, statusLabel, t } from './i18n';

/**
 * A busy flag for an action. The guard (isBusy) reads a ref, so 2 submits in the same tick
 * cannot both start (a state value is stale until the next render).
 */
export function useBusy(): [boolean, (b: boolean) => void, () => boolean] {
  const [busy, setState] = useState(false);
  const ref = useRef(false);
  const set = (b: boolean) => {
    ref.current = b;
    setState(b);
  };
  return [busy, set, () => ref.current];
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span class={`status status-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {statusLabel(status)}
    </span>
  );
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** A stable color index (0–7) from a string. */
export function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 8;
}

export function Avatar({ userId }: { userId: string }) {
  const { userName } = useApp();
  const name = userName(userId);
  return (
    <span class={`avatar c${hue(userId)}`} title={name} role="img" aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: { id: string; name: string }; onRemove?: () => void }) {
  return (
    <span class={`tag c${hue(tag.id)}`} title={tag.name}>
      {tag.name}
      {onRemove && (
        <button type="button" class="chip-x" onClick={onRemove} aria-label={t('task.tagRemove', { name: tag.name })}>
          ×
        </button>
      )}
    </span>
  );
}

export function DueLabel({ due, status, short }: { due: Due | null; status: Status; short?: boolean }) {
  const { now, settings } = useApp();
  if (!due) return short ? null : <span class="muted">{t('task.dueNone')}</span>;
  const s = dueState({ due, status }, now, settings.dueSoonDays);
  return (
    <span class={`due ${s ?? ''}`}>
      {s === 'overdue' && <span aria-hidden="true">‼ </span>}
      {s === 'soon' && <span aria-hidden="true">⏰ </span>}
      {fmtDateTime(due.at, due.allDay)}
      {s && <span class="due-word"> {t(s === 'overdue' ? 'due.overdue' : 'due.soon')}</span>}
    </span>
  );
}

/** A modal dialog (native <dialog>: focus trap, Esc closes). */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    // The control that opened the dialog gets the focus back when the dialog closes.
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    // If the opener is removed (for example a status button after the status change), the task panel gets the focus.
    const container = opener?.closest<HTMLElement>('.drawer') ?? null;
    if (!d.open) d.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener('cancel', cancel);
    return () => {
      d.removeEventListener('cancel', cancel);
      // After the close, the opener can be gone: then its panel, if it is still there, else nothing.
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body && document.activeElement !== null) return;
        if (opener?.isConnected) opener.focus();
        else if (container?.isConnected) container.focus();
      });
    };
  }, []);
  return (
    <dialog ref={ref} class={wide ? 'wide' : ''} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export interface PickItem {
  id: string;
  label: string;
}

/**
 * A search picker: a text field and a list of matches. Enter takes the first match.
 * `create` adds an item "new …" for a text that matches nothing (for tags).
 */
export function Picker({ items, onPick, label, create, onClose }: { items: PickItem[]; onPick: (id: string) => void; label: string; create?: (text: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const f = fold(q.trim());
  const list = useMemo(() => items.filter((i) => fold(i.label).includes(f)).slice(0, 12), [items, f]);
  const exact = items.some((i) => fold(i.label) === f);
  const choose = (id: string) => {
    onPick(id);
    onClose();
  };
  return (
    <div class="picker" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <input
        ref={input}
        type="text"
        aria-label={label}
        placeholder={label}
        value={q}
        maxLength={40}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (list[0]) choose(list[0].id);
          else if (create && q.trim()) (create(q.trim()), onClose());
        }}
      />
      <ul>
        {list.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => choose(i.id)}>
              {i.label}
            </button>
          </li>
        ))}
        {create && q.trim() && !exact && (
          <li>
            <button type="button" class="create" onClick={() => (create(q.trim()), onClose())}>
              {t('task.tagNew', { name: q.trim() })}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
