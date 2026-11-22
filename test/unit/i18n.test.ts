// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { fmtDate, fmtDateTime, fmtRelative, isoToInputs, nAttachmentsGen, nFiles, nMoreWrites, nOpenTasksLoc, nShowMore, nShownChanges, nTasks, nUnread, nVerifyWaiting, opLabel, plu, pragueToIso, quote, setLang, t, TABLES } from '../../src/ui/i18n';

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

describe('English', () => {
  afterEach(() => setLang('cs'));

  it('has the same keys and placeholders as Czech in each table, and no empty text', () => {
    const marks = (x: string) => [...x.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const [name, table] of Object.entries(TABLES)) {
      const cs = table.cs as Record<string, string>;
      const en = table.en as Record<string, string>;
      expect(Object.keys(en).sort(), name).toEqual(Object.keys(cs).sort());
      for (const k of Object.keys(cs)) {
        expect(marks(en[k]), `${name}.${k}`).toEqual(marks(cs[k]));
        // Empty in both or in none (an empty field name = a technical field that the UI does not show).
        expect(en[k] === '', `${name}.${k}`).toBe(cs[k] === '');
      }
    }
  });

  it('uses the current language, and the parameter of t() before it', () => {
    expect(t('nav.all')).toBe('Všechny úkoly');
    setLang('en');
    expect(t('nav.all')).toBe('All tasks');
    expect(t('nav.all', {}, 'cs')).toBe('Všechny úkoly');
    expect(t('gate.enroll.waiting', { s: 30 })).toBe('Waiting for approval. The app checks this automatically (every 30 s).');
    expect(opLabel('CreateTask')).toBe('Task created');
    expect(quote('Toner')).toBe('"Toner"');
    setLang('cs');
    expect(quote('Toner')).toBe('„Toner“');
  });

  it('uses English plurals', () => {
    setLang('en');
    expect([1, 2, 0].map(nTasks)).toEqual(['1 task', '2 tasks', '0 tasks']);
    expect(nShownChanges(1, 5)).toBe('Showing 1 change of 5');
    expect(nShownChanges(3, 40)).toBe('Showing 3 changes of 40');
    expect(nShowMore(3)).toBe('Show 3 more');
    expect(nMoreWrites(1)).toBe('and 1 more write');
    expect(nMoreWrites(7)).toBe('and 7 more writes');
    expect(nVerifyWaiting(1)).toBe('1 task waits for verification');
    expect(nVerifyWaiting(2)).toBe('2 tasks wait for verification');
    expect(nUnread(2)).toBe('2 unread');
    expect(nAttachmentsGen(3)).toBe('3 attachments');
    expect(nOpenTasksLoc(1)).toBe('1 open task');
    expect(nFiles(12)).toBe('12 change files');
  });

  it('formats dates in Europe/Prague', () => {
    setLang('en');
    expect(fmtDateTime('2026-11-19T13:30:00.000Z')).toBe('19 Nov 2026 14:30');
    expect(fmtDate('2026-11-19T23:30:00.000Z')).toBe('20 Nov 2026');
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(fmtRelative('2026-11-24T12:00:00Z', now)).toBe('in 5 days');
    expect(fmtRelative('2026-11-19T09:00:00Z', now)).toBe('3 hours ago');
    expect(fmtRelative('2026-11-19T11:59:30Z', now)).toBe('just now');
  });
});
