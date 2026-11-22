// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The built-in guides: the user guide for all users, the admin guide for admins.
// The Markdown files are part of the build (?raw): no network, and the guide matches the app version.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import ADMIN_GUIDE from '../../docs/admin-guide.md?raw';
import USER_GUIDE from '../../docs/user-guide.md?raw';
import { href, useApp } from './ctx';
import { parseDoc, tocOf, type DocBlock } from './docs';
import { t } from './i18n';
import type { Inline } from './markdown';
import { Dialog } from './widgets';

export type Guide = 'user' | 'admin';
const SOURCES: Record<Guide, string> = { user: USER_GUIDE, admin: ADMIN_GUIDE };
/** The images of the guides (docs/img/*.jpg), bundled as data: URLs. */
const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../docs/img/*.jpg', { eager: true, query: '?inline', import: 'default' })).map(([p, url]) => [p.split('/').pop()!, url]),
);
/** The route of a guide: #/help (user guide) and #/help/admin. */
const ROUTE: Record<Guide, string[]> = { user: ['help'], admin: ['help', 'admin'] };

function inl(nodes: Inline[], onLocal: (href: string) => void): ComponentChildren[] {
  return nodes.map((n, i) => {
    switch (n.k) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={i} />;
      case 'b':
        return <strong key={i}>{inl(n.c, onLocal)}</strong>;
      case 'i':
        return <em key={i}>{inl(n.c, onLocal)}</em>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'a':
        return n.href.startsWith('#/') ? (
          <a
            key={i}
            href={n.href}
            onClick={(e) => {
              e.preventDefault();
              onLocal(n.href);
            }}
          >
            {inl(n.c, onLocal)}
          </a>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inl(n.c, onLocal)}
          </a>
        );
    }
  });
}

/** The section ID of a local link "#/help?s=klic" or "#/help/admin?s=klic". */
function target(local: string): { guide: Guide | null; section: string | null } {
  const [path, query = ''] = local.slice(2).split('?');
  const guide: Guide | null = path === 'help' ? 'user' : path === 'help/admin' ? 'admin' : null;
  const s = new URLSearchParams(query).get('s');
  return { guide, section: s };
}

/** 1 guide: the table of contents and the text. `onLocal` handles links inside the app. */
function DocView({ guide, onLocal, section }: { guide: Guide; onLocal: (href: string) => void; section?: string | null }) {
  const blocks = useMemo(() => parseDoc(SOURCES[guide]), [guide]);
  const toc = useMemo(() => tocOf(blocks), [blocks]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!section) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(section)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    }
  }, [section, guide]);
  const block = (b: DocBlock, i: number) => {
    switch (b.k) {
      case 'h': {
        const H = (`h${b.level}` as 'h1' | 'h2' | 'h3');
        return (
          <H key={i} id={`doc-${b.id}`} data-section={b.id} tabIndex={-1}>
            {inl(b.c, onLocal)}
          </H>
        );
      }
      case 'p':
        return <p key={i}>{inl(b.c, onLocal)}</p>;
      case 'img':
        return IMAGES[b.name] ? (
          <figure key={i} class="doc-img">
            <img src={IMAGES[b.name]} alt={b.alt} loading="lazy" />
            <figcaption>{b.alt}</figcaption>
          </figure>
        ) : (
          <p key={i} class="muted">
            [{b.alt}]
          </p>
        );
      case 'note':
        return (
          <p key={i} class="doc-note">
            {inl(b.c, onLocal)}
          </p>
        );
      case 'ul':
        return (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inl(it, onLocal)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i} start={b.start}>
            {b.items.map((it, j) => (
              <li key={j}>{inl(it, onLocal)}</li>
            ))}
          </ol>
        );
    }
  };
  return (
    <div class="doc" ref={box}>
      {toc.length > 2 && (
        <nav class="doc-toc" aria-label={t('help.toc')}>
          <h2>{t('help.toc')}</h2>
          <ul>
            {toc.map((x) => (
              <li key={x.id}>
                <a
                  href={href(ROUTE[guide], { s: x.id })}
                  onClick={(e) => {
                    e.preventDefault();
                    onLocal(href(ROUTE[guide], { s: x.id }));
                  }}
                >
                  {x.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <article class="doc-body">{blocks.map(block)}</article>
    </div>
  );
}

/** The help page in the app: #/help, #/help/admin (admins only). `?s=<id>` scrolls to a section. */
export function HelpPage({ guide }: { guide: Guide }) {
  const app = useApp();
  if (guide === 'admin' && !app.isAdmin) return <p class="page">{t('admin.notAllowed')}</p>;
  const onLocal = (local: string) => {
    const tg = target(local);
    if (tg.guide === 'admin' && !app.isAdmin) return;
    // A link to a section: replace the history entry, so "Back" leaves the guide in 1 step.
    if (tg.guide === guide) {
      history.replaceState(null, '', local);
      // replaceState sends no hashchange event: send it, so the router reads the new section.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else app.nav(local);
  };
  return (
    <section class="page help">
      {app.isAdmin && (
        <div class="seg help-switch" role="group" aria-label={t('help.title')}>
          <button type="button" aria-pressed={guide === 'user'} onClick={() => app.nav(href(ROUTE.user))}>
            {t('help.user')}
          </button>
          <button type="button" aria-pressed={guide === 'admin'} onClick={() => app.nav(href(ROUTE.admin))}>
            {t('help.admin')}
          </button>
        </div>
      )}
      <DocView guide={guide} onLocal={onLocal} section={app.route.query.s} />
    </section>
  );
}

/** The user guide in a dialog (start screens: the app router is not active there). */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const onLocal = (local: string) => {
    const { guide, section } = target(local);
    if (guide !== 'user' || !section) return;
    box.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(section)}"]`)?.scrollIntoView({ block: 'start' });
  };
  return (
    <Dialog title={t('help.user')} onClose={onClose} wide>
      <div class="help-dialog" lang="cs" ref={box}>
        <DocView guide="user" onLocal={onLocal} />
      </div>
      <div class="row end">
        <button type="button" class="primary" autoFocus onClick={onClose}>
          {t('task.close')}
        </button>
      </div>
    </Dialog>
  );
}
