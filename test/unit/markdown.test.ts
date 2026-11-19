// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { parseInline, parseMarkdown, safeUrl } from '../../src/ui/markdown';

const links = (s: string) => JSON.stringify(parseMarkdown(s)).match(/"href":"[^"]*"/g) ?? [];

describe('safe markdown', () => {
  it('formats bold, italic, code, lists and paragraphs', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { k: 'text', v: 'a ' }, { k: 'b', c: [{ k: 'text', v: 'b' }] }, { k: 'text', v: ' ' }, { k: 'i', c: [{ k: 'text', v: 'c' }] }, { k: 'text', v: ' ' }, { k: 'code', v: 'd' },
    ]);
    expect(parseMarkdown('- jedna\n- dvě\n\n1. první\n2. druhý\n\nText\nřádek').map((b) => b.k)).toEqual(['ul', 'ol', 'p']);
  });

  it('makes links only for http, https and mailto', () => {
    expect(links('[Registr](https://example.invalid/x) a mailto:a@example.invalid')).toEqual(['"href":"https://example.invalid/x"', '"href":"mailto:a@example.invalid"']);
    for (const bad of ['[x](javascript:alert(1))', '[x](JavaScript:alert(1))', '[x](data:text/html,<b>)', '[x](vbscript:x)', '[x](file:///etc/passwd)', 'javascript:alert(1)', '[x](//evil.invalid)'])
      expect(links(bad)).toEqual([]);
    expect(safeUrl(' https://a.invalid ')).toBe('https://a.invalid/');
    expect(safeUrl('https://a b')).toBeNull();
  });

  it('keeps HTML as text', () => {
    expect(JSON.stringify(parseMarkdown('<img src=x onerror=alert(1)> <script>x</script>'))).toContain('<img src=x onerror=alert(1)>');
    expect(parseMarkdown('<b>x</b>')).toEqual([{ k: 'p', c: [{ k: 'text', v: '<b>x</b>' }] }]);
  });

  it('ends a bare URL before trailing punctuation', () => {
    expect(links('Viz https://example.invalid/a.')).toEqual(['"href":"https://example.invalid/a"']);
  });

  it('handles deep nesting without a stack overflow', () => {
    expect(() => parseMarkdown('**'.repeat(5000) + 'x' + '**'.repeat(5000))).not.toThrow();
  });
});

describe('markdown performance', () => {
  // Relative, so that the test does not depend on the load of the machine:
  // linear cost gives about 4 times for 4 times the length, quadratic cost about 16 times.
  const time = (s: string) => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      parseMarkdown(s);
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };
  it('parses hostile input in linear time', () => {
    for (const unit of ['[a', '`', '* ', 'https://a ', '**', 'x', 'http://x[', '[http://x']) {
      const n = Math.floor(5_000 / unit.length);
      const short = time(unit.repeat(n));
      const long = time(unit.repeat(4 * n));
      expect(long, unit).toBeLessThan(8 * short + 15);
    }
  });
});
