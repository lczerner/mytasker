// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { fmtDate, fmtDateTime, fmtRelative, isoToInputs, nTasks, plu, pragueToIso, t } from '../../src/ui/i18n';

describe('Czech formats', () => {
  it('formats dates as 19. 11. 2026 14:30 in Europe/Prague', () => {
    expect(fmtDateTime('2026-11-19T13:30:00.000Z')).toBe('19. 11. 2026 14:30');
    expect(fmtDateTime('2026-07-01T12:00:00.000Z')).toBe('1. 7. 2026 14:00');
    expect(fmtDate('2026-11-19T23:30:00.000Z')).toBe('20. 11. 2026');
    expect(fmtDateTime('2026-11-25T22:59:59.000Z', true)).toBe('25. 11. 2026');
  });

  it('converts a Prague date and time to UTC, also at daylight saving changes', () => {
    expect(pragueToIso('2026-11-19', '14:30')).toBe('2026-11-19T13:30:00.000Z');
    expect(pragueToIso('2026-07-01', '14:00')).toBe('2026-07-01T12:00:00.000Z');
    expect(pragueToIso('2026-11-25', null)).toBe('2026-11-25T22:59:59.000Z');
    expect(pragueToIso('2026-03-29', '03:30')).toBe('2026-03-29T01:30:00.000Z'); // the day of the change to summer time
    expect(pragueToIso('2026-10-25', '12:00')).toBe('2026-10-25T11:00:00.000Z'); // the day of the change to winter time
    expect(isoToInputs('2026-11-19T13:30:00.000Z')).toEqual({ date: '2026-11-19', time: '14:30' });
  });

  it('uses Czech plurals and relative times', () => {
    expect([1, 2, 4, 5, 0, 21].map(nTasks)).toEqual(['1 úkol', '2 úkoly', '4 úkoly', '5 úkolů', '0 úkolů', '21 úkolů']);
    expect(plu(3, ['den', 'dny', 'dní'])).toBe('3 dny');
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(fmtRelative('2026-11-21T12:00:00Z', now)).toBe('pozítří');
    expect(fmtRelative('2026-11-24T12:00:00Z', now)).toBe('za 5 dní');
    expect(fmtRelative('2026-11-19T09:00:00Z', now)).toBe('před 3 hodinami');
    expect(fmtRelative('x', now)).toBe('');
  });

  it('fills parameters', () => {
    expect(t('task.fileTooBig', { mb: 25 })).toBe('Soubor je větší než povolený limit 25 MB.');
  });
});
