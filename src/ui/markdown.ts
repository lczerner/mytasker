// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// A small, safe Markdown parser (ADR 0011). It makes a tree, never HTML text.
// Supported: paragraphs, line breaks, - and 1. lists, **bold**, *italic*, `code`,
// [text](url) and bare URLs. Links: only http:, https: and mailto:. No raw HTML.

export type Inline =
  | { k: 'text'; v: string }
  | { k: 'br' }
  | { k: 'b'; c: Inline[] }
  | { k: 'i'; c: Inline[] }
  | { k: 'code'; v: string }
  | { k: 'a'; href: string; c: Inline[] };

export type Block = { k: 'p'; c: Inline[] } | { k: 'ul' | 'ol'; items: Inline[][] };

const SCHEMES = ['http:', 'https:', 'mailto:'];

/** The URL if it is an absolute http(s) or mailto URL, else null. */
export function safeUrl(raw: string): string | null {
  const s = raw.trim();
  if (/[\u0000-\u001f\s]/.test(s)) return null;
  try {
    const u = new URL(s);
    return SCHEMES.includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

// Sticky (y): it matches only at lastIndex, so the parser never scans the rest of the text again.
const URL_RE = /(?:https?:\/\/|mailto:)[^\s<>()]+[^\s<>().,;:!?'"]/y;

const SPECIAL_RE = /[\n`*[]|https?:\/\/|mailto:/g;
const LINK_RE = /\[([^\]\n]{1,500})\]\(([^)\s]{1,2000})\)/y;

export function parseInline(s: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ k: 'text', v: text });
    text = '';
  };
  let i = 0;
  let nextClose = s.indexOf(']');
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') {
      flush();
      out.push({ k: 'br' });
      i++;
      continue;
    }
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ k: 'code', v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (depth < 4 && s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ k: 'b', c: parseInline(s.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < 4 && c === '*' && s[i + 1] !== ' ' && s[i + 1] !== '*') {
      const end = s.indexOf('*', i + 1);
      if (end > i + 1 && s[end - 1] !== ' ') {
        flush();
        out.push({ k: 'i', c: parseInline(s.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (c === '[') {
      // The next "]" (a pointer that only moves forward, so the total cost is linear).
      if (nextClose !== -1 && nextClose < i) nextClose = s.indexOf(']', i);
      const m = nextClose !== -1 && nextClose - i <= 501 ? ((LINK_RE.lastIndex = i), LINK_RE.exec(s)) : null;
      if (m) {
        const href = safeUrl(m[2]);
        flush();
        if (href) out.push({ k: 'a', href, c: parseInline(m[1], depth + 1) });
        else out.push({ k: 'text', v: m[0] }); // not a permitted link: show the text as it is
        i += m[0].length;
        continue;
      }
    }
    URL_RE.lastIndex = i;
    const u = (s[i] === 'h' || s[i] === 'm') && (i === 0 || !/[A-Za-z0-9]/.test(s[i - 1])) ? URL_RE.exec(s) : null;
    if (u) {
      const href = safeUrl(u[0]);
      if (href) {
        flush();
        out.push({ k: 'a', href, c: [{ k: 'text', v: u[0] }] });
      } else text += u[0]; // a refused URL: plain text, and never matched again (linear cost)
      i += u[0].length;
      continue;
    }
    // Plain text up to the next special character (a sticky search from i + 1).
    SPECIAL_RE.lastIndex = i + 1;
    const m = SPECIAL_RE.exec(s);
    const n = (m ? m.index : s.length) - i;
    text += s.slice(i, i + n);
    i += n;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of src.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n');
    if (!chunk.trim()) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) blocks.push({ k: 'ul', items: lines.map((l) => parseInline(l.replace(/^\s*[-*]\s+/, ''))) });
    else if (lines.every((l) => /^\s*\d{1,3}[.)]\s+/.test(l))) blocks.push({ k: 'ol', items: lines.map((l) => parseInline(l.replace(/^\s*\d{1,3}[.)]\s+/, ''))) });
    else blocks.push({ k: 'p', c: parseInline(chunk.replace(/^\n+|\n+$/g, '')) });
  }
  return blocks;
}
