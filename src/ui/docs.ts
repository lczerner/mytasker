// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The parser of the built-in guides (docs/user-guide.md, docs/admin-guide.md). It makes a tree,
// never HTML text. In addition to the task Markdown (markdown.ts) it has headings (#, ##, ###),
// notes (lines that start with "> ") and links inside the app ("#/help…" and "#/…").
// The guides are part of the build: they are not user input, but the parser is safe for any text.
import { parseInline, type Inline } from './markdown';

export type DocBlock =
  | { k: 'h'; level: 1 | 2 | 3; id: string; c: Inline[]; text: string }
  | { k: 'p'; c: Inline[] }
  | { k: 'note'; c: Inline[] }
  /** An image of the guide: only a file name in docs/img/ (the build bundles these files). */
  | { k: 'img'; name: string; alt: string }
  | { k: 'ul'; items: Inline[][] }
  | { k: 'ol'; start: number; items: Inline[][] };

/** A heading ID from its text: "3. Stavy úkolu" → "stavy-ukolu". */
export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^\d+(\.\d+)*\.?\s*/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sekce'
  );
}

/** A local link of the guides: "#/…" with safe characters only. */
const LOCAL_RE = /^#\/[A-Za-z0-9/_\-?=&.]{0,200}$/;

/** Turns refused local links of parseInline (shown as text) into local links. */
function localLinks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.k === 'text') {
      // parseInline keeps a refused link "[text](href)" as 1 text node with exactly that text.
      const re = /\[([^\]\n]{1,500})\]\((#\/[^)\s]{0,200})\)/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(n.v))) {
        if (!LOCAL_RE.test(m[2])) continue;
        if (m.index > last) out.push({ k: 'text', v: n.v.slice(last, m.index) });
        out.push({ k: 'a', href: m[2], c: [{ k: 'text', v: m[1] }] });
        last = m.index + m[0].length;
      }
      if (last < n.v.length) out.push({ k: 'text', v: n.v.slice(last) });
    } else if (n.k === 'b' || n.k === 'i') out.push({ ...n, c: localLinks(n.c) });
    else out.push(n);
  }
  return out;
}

const inline = (s: string) => localLinks(parseInline(s));

/** An image line: ![alt](img/<name>.jpg). Other image lines are text. */
const IMG_RE = /^!\[([^\]\n]{1,200})\]\(img\/([a-z0-9-]{1,40}\.jpg)\)$/;

export function parseDoc(src: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const seen = new Map<string, number>();
  for (const chunk of src.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    if (!chunk.trim()) continue;
    const lines = chunk.split('\n');
    // A heading is 1 line. Text after it in the same chunk is a paragraph.
    const h = /^(#{1,3})\s+(.+)$/.exec(lines[0]);
    if (h) {
      const text = h[2].trim();
      let id = slug(text);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      blocks.push({ k: 'h', level: h[1].length as 1 | 2 | 3, id, c: inline(text), text });
      lines.shift();
      if (!lines.length) continue;
    }
    const img = lines.length === 1 ? IMG_RE.exec(lines[0]) : null;
    if (img) blocks.push({ k: 'img', alt: img[1], name: img[2] });
    else if (lines.every((l) => /^>\s?/.test(l))) blocks.push({ k: 'note', c: inline(lines.map((l) => l.replace(/^>\s?/, '')).join('\n')) });
    else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) blocks.push({ k: 'ul', items: lines.map((l) => inline(l.replace(/^\s*[-*]\s+/, ''))) });
    else if (lines.every((l) => /^\s*\d{1,3}[.)]\s+/.test(l))) blocks.push({ k: 'ol', start: Number(/\d+/.exec(lines[0])![0]), items: lines.map((l) => inline(l.replace(/^\s*\d{1,3}[.)]\s+/, ''))) });
    else blocks.push({ k: 'p', c: inline(lines.join('\n')) });
  }
  return blocks;
}

/** The table of contents: the level-2 headings. */
export const tocOf = (blocks: DocBlock[]): { id: string; text: string }[] => blocks.filter((b): b is Extract<DocBlock, { k: 'h' }> => b.k === 'h' && b.level === 2).map((b) => ({ id: b.id, text: b.text }));
