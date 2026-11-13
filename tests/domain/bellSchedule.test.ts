import { describe, expect, it } from 'vitest';
import { blockPeriods, daySessions, DEFAULT_BELL_SCHEDULE } from '../../src/domain/bellSchedule';

describe('blockPeriods', () => {
  it('splits a 70-minute block into two 35-minute periods', () => {
    expect(blockPeriods({ block: 0, start: '08:00', end: '09:10' })).toEqual([
      { number: 1, start: '08:00', end: '08:35' },
      { number: 2, start: '08:35', end: '09:10' },
    ]);
  });

  it('numbers the last block as periods 9 and 10', () => {
    const [first, second] = blockPeriods({ block: 4, start: '14:50', end: '16:00' });
    expect([first.number, second.number]).toEqual([9, 10]);
    expect(second.start).toBe('15:25');
  });
});

describe('DEFAULT_BELL_SCHEDULE', () => {
  it('starts with breakfast and the getting-ready row before period 1', () => {
    const [breakfast, ready] = DEFAULT_BELL_SCHEDULE;
    expect(breakfast).toMatchObject({ kind: 'break', start: '07:00', end: '07:50' });
    expect(ready).toMatchObject({ kind: 'break', start: '07:50', end: '08:00' });
  });

  it('shows the flag salute on Monday', () => {
    const ready = DEFAULT_BELL_SCHEDULE[1];
    expect(ready?.kind === 'break' && ready.dayLabels).toEqual([
      { day: 0, label: 'Flag salute', note: 'Chào cờ' },
    ]);
  });

  it('has exactly one lunch row, which splits the day into morning and afternoon', () => {
    const lunches = DEFAULT_BELL_SCHEDULE.filter(
      (row) => row.kind === 'break' && row.type === 'lunch',
    );
    expect(lunches).toMatchObject([{ start: '11:50', end: '13:20' }]);
  });
});

describe('daySessions', () => {
  it('splits the school day at lunch', () => {
    expect(daySessions(DEFAULT_BELL_SCHEDULE)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it('gives one part for a day with no lunch', () => {
    const noLunch = DEFAULT_BELL_SCHEDULE.filter((r) => r.kind === 'block' || r.type !== 'lunch');
    expect(daySessions(noLunch)).toEqual([[0, 1, 2, 3, 4]]);
  });
});
