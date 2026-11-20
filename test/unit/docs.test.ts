// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The parser of the built-in guides, and the guides themselves (headings, links).
import { existsSync, readFileSync } from 'node:fs';
import { parseDoc, slug, tocOf, type DocBlock } from '../../src/ui/docs';
import type { Inline } from '../../src/ui/markdown';

const links = (nodes: Inline[]): string[] => nodes.flatMap((n) => (n.k === 'a' ? [n.href] : n.k === 'b' || n.k === 'i' ? links(n.c) : []));
const allLinks = (blocks: DocBlock[]): string[] =>
  blocks.flatMap((b) => (b.k === 'ul' || b.k === 'ol' ? b.items.flatMap(links) : 'c' in b ? links(b.c) : []));

describe('parseDoc', () => {
  it('makes headings with IDs, notes, lists with a start number and paragraphs', () => {
    const b = parseDoc('# Příručka\n\n## 2. Stavy úkolu\n\n> **Pozor:** text\n\n3. třetí\n4. čtvrtý\n\n- a\n- b\n\nOdstavec\nřádek');
    expect(b.map((x) => x.k)).toEqual(['h', 'h', 'note', 'ol', 'ul', 'p']);
    expect(b[1]).toMatchObject({ k: 'h', level: 2, id: 'stavy-ukolu', text: '2. Stavy úkolu' });
    expect(b[3]).toMatchObject({ k: 'ol', start: 3 });
    expect(tocOf(b)).toEqual([{ id: 'stavy-ukolu', text: '2. Stavy úkolu' }]);
  });

  it('makes unique IDs for headings with the same text', () => {
    const b = parseDoc('## Postup\n\n## Postup');
    expect(b.map((x) => (x.k === 'h' ? x.id : ''))).toEqual(['postup', 'postup-2']);
    expect(slug('10. Časté potíže!')).toBe('caste-potize');
  });

  it('permits only safe links: http(s), mailto and local "#/" links', () => {
    const b = parseDoc('[a](#/help?s=x) [b](https://example.org) [c](javascript:alert(1)) [d](#/x"onclick) [e](data:text/html,x) [f](#nolocal)');
    expect(allLinks(b)).toEqual(['#/help?s=x', 'https://example.org/']);
  });

  it('makes an image only from a file name in img/; other image lines are text', () => {
    const b = parseDoc('![Tabule](img/tabule.jpg)\n\n![x](img/../tajne.jpg)\n\n![x](javascript:alert(1))\n\n![x](https://example.org/a.jpg)');
    expect(b[0]).toEqual({ k: 'img', alt: 'Tabule', name: 'tabule.jpg' });
    expect(b.slice(1).every((x) => x.k === 'p')).toBe(true);
  });

  it('keeps raw HTML as text', () => {
    const b = parseDoc('<img src=x onerror=alert(1)>');
    expect(b).toEqual([{ k: 'p', c: [{ k: 'text', v: '<img src=x onerror=alert(1)>' }] }]);
  });
});

describe('the guides', () => {
  const guides = { user: readFileSync('docs/user-guide.md', 'utf8'), admin: readFileSync('docs/admin-guide.md', 'utf8') };
  const route = { user: 'help', admin: 'help/admin' } as const;
  for (const [name, src] of Object.entries(guides)) {
    it(`${name}: no nested lists, no external URLs, and each local link points to an existing guide and section`, () => {
      // The guide parser has no nested lists: an indented list line would become text.
      expect(src.split('\n').filter((l) => /^\s+([-*]|\d+[.)])\s/.test(l))).toEqual([]);
      // The build check refuses external URLs in the app file.
      expect(src).not.toMatch(/https?:\/\/[a-z]/i);
      const blocks = parseDoc(src);
      expect(tocOf(blocks).length).toBeGreaterThan(5);
      // Each image exists (the build bundles docs/img/*.jpg).
      for (const x of blocks) if (x.k === 'img') expect(existsSync(`docs/img/${x.name}`), x.name).toBe(true);
      expect(blocks.some((x) => x.k === 'img')).toBe(true);
      for (const href of allLinks(blocks)) {
        const [path, q = ''] = href.slice(2).split('?');
        const g = path === route.user ? 'user' : path === route.admin ? 'admin' : null;
        expect(g, href).not.toBeNull();
        const s = new URLSearchParams(q).get('s');
        if (s) expect(tocOf(parseDoc(guides[g!])).map((x) => x.id), href).toContain(s);
      }
    });
  }
});
