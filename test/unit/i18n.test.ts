// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { fmtDate, fmtDateTime, fmtRelative, isoToInputs, nMoreWrites, nShowMore, nShownChanges, nTasks, nUnread, nVerifyWaiting, plu, pragueToIso, t } from '../../src/ui/i18n';

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

  it('has English for the start screens only', () => {
    expect(t('gate.enroll.waiting', { s: 30 }, 'en')).toBe('Waiting for approval. The app checks this automatically (every 30 s).');
    expect(t('gate.language', {}, 'en')).toBe('Česky');
    expect(t('nav.all', {}, 'en')).toBe('Všechny úkoly'); // no English text: Czech
  });
});

describe('nVerifyWaiting', () => {
  it('uses the Czech plural of the noun and of the verb', () => {
    expect(nVerifyWaiting(1)).toBe('1 úkol čeká na kontrolu');
    expect(nVerifyWaiting(2)).toBe('2 úkoly čekají na kontrolu');
    expect(nVerifyWaiting(4)).toBe('4 úkoly čekají na kontrolu');
    expect(nVerifyWaiting(5)).toBe('5 úkolů čeká na kontrolu');
    expect(nVerifyWaiting(21)).toBe('21 úkolů čeká na kontrolu');
  });
});

describe('nUnread', () => {
  it('uses the Czech plural', () => {
    expect(nUnread(1)).toBe('1 nepřečtené');
    expect(nUnread(2)).toBe('2 nepřečtená');
    expect(nUnread(5)).toBe('5 nepřečtených');
  });
});

describe('audit plurals', () => {
  it('uses the Czech plural', () => {
    expect(nShownChanges(1, 1)).toBe('Zobrazena 1 změna z 1');
    expect(nShownChanges(0, 5)).toBe('Zobrazeno 0 změn z 5');
    expect(nShownChanges(3, 40)).toBe('Zobrazeny 3 změny z 40');
    expect(nShownChanges(40, 40)).toBe('Zobrazeno 40 změn z 40');
    expect(nShowMore(1)).toBe('Zobrazit další 1');
    expect(nShowMore(3)).toBe('Zobrazit další 3');
    expect(nShowMore(200)).toBe('Zobrazit dalších 200');
    expect(nMoreWrites(1)).toBe('a další 1 zápis');
    expect(nMoreWrites(2)).toBe('a další 2 zápisy');
    expect(nMoreWrites(7)).toBe('a dalších 7 zápisů');
  });
});
