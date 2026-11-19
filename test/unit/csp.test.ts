// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The CSP of the built page must block all network access (AGENTS.md §2).
import { CSP } from '../../vite.config';

const directives = new Map(CSP.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)] as const));

describe('CSP', () => {
  it('blocks network access and remote sources', () => {
    expect(directives.get('default-src')).toEqual(["'none'"]);
    expect(directives.get('connect-src')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
    expect(directives.get('frame-src')).toEqual(["'none'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
  });

  it('permits only inline code and local image sources', () => {
    expect(directives.get('script-src')).toEqual(["'unsafe-inline'"]);
    expect(directives.get('style-src')).toEqual(["'unsafe-inline'"]);
    expect(directives.get('img-src')).toEqual(['data:', 'blob:']);
    for (const [, sources] of directives) for (const s of sources) expect(s).not.toMatch(/^(https?:|wss?:|\*)/);
  });
});
