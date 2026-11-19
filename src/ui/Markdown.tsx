// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Renders the tree of markdown.ts as Preact nodes. Preact escapes all text. No innerHTML.
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { parseMarkdown, type Inline } from './markdown';

function inl(nodes: Inline[]): ComponentChildren[] {
  return nodes.map((n, i) => {
    switch (n.k) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={i} />;
      case 'b':
        return <strong key={i}>{inl(n.c)}</strong>;
      case 'i':
        return <em key={i}>{inl(n.c)}</em>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'a':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inl(n.c)}
          </a>
        );
    }
  });
}

export function Markdown({ text, class: cls }: { text: string; class?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div class={`md ${cls ?? ''}`}>
      {blocks.map((b, i) =>
        b.k === 'p' ? (
          <p key={i}>{inl(b.c)}</p>
        ) : b.k === 'ul' ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ul>
        ) : (
          <ol key={i}>{b.items.map((it, j) => <li key={j}>{inl(it)}</li>)}</ol>
        ),
      )}
    </div>
  );
}
