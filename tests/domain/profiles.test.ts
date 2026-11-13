import { describe, expect, it } from 'vitest';
import {
  checkProfileName,
  lastChangedText,
  profileDeletionLines,
  tidyProfileNames,
  uniqueProfileName,
} from '../../src/domain/profiles';

const profiles = [
  { id: 'p1', name: 'Timetable' },
  { id: 'p2', name: 'Học kỳ 2' },
];

describe('checkProfileName (PF-2)', () => {
  it('cleans the name it accepts', () => {
    expect(checkProfileName(profiles, '  Draft   term 2 ')).toEqual({
      ok: true,
      name: 'Draft term 2',
    });
  });

  it('requires a name', () => {
    expect(checkProfileName(profiles, '   ')).toEqual({
      ok: false,
      error: 'Enter a profile name.',
    });
  });

  it('rejects a name another profile has, with case not counting', () => {
    expect(checkProfileName(profiles, 'timetable')).toEqual({
      ok: false,
      error: "There's already a profile called Timetable.",
    });
    expect(checkProfileName(profiles, 'HỌC KỲ 2').ok).toBe(false);
  });

  it('counts accents, so a name that differs only by them is free', () => {
    expect(checkProfileName(profiles, 'Hoc ky 2')).toEqual({ ok: true, name: 'Hoc ky 2' });
  });

  it("lets a profile keep its own name when it's renamed", () => {
    expect(checkProfileName(profiles, 'TIMETABLE', 'p1')).toEqual({
      ok: true,
      name: 'TIMETABLE',
    });
  });

  it('allows 60 characters and no more', () => {
    expect(checkProfileName(profiles, 'Đ'.repeat(60)).ok).toBe(true);
    expect(checkProfileName(profiles, 'a'.repeat(61))).toEqual({
      ok: false,
      error: 'A profile name can be at most 60 characters.',
    });
  });
});

describe('uniqueProfileName', () => {
  it('numbers a name that is taken, keeping it to 60 characters', () => {
    expect(uniqueProfileName(profiles, 'Draft')).toBe('Draft');
    expect(uniqueProfileName(profiles, 'TIMETABLE')).toBe('TIMETABLE 2');
    const long = 'a'.repeat(70);
    expect(uniqueProfileName([], long)).toBe('a'.repeat(60));
    expect(uniqueProfileName([{ id: 'x', name: 'a'.repeat(60) }], long)).toBe(
      `${'a'.repeat(58)} 2`,
    );
  });
});

describe('tidyProfileNames', () => {
  it('cleans names, names empty ones by place, and numbers repeats', () => {
    expect(
      tidyProfileNames([
        { id: 'a', name: ' Học  kỳ 1 ' },
        { id: 'b', name: '   ' },
        { id: 'c', name: 'học kỳ 1' },
      ]),
    ).toEqual([
      { id: 'a', name: 'Học kỳ 1' },
      { id: 'b', name: 'Profile 2' },
      { id: 'c', name: 'học kỳ 1 2' },
    ]);
  });
});

describe('lastChangedText (PF-2)', () => {
  const now = new Date(2026, 9, 28, 16, 30);

  it('gives the time for today and yesterday, in local time', () => {
    expect(lastChangedText(new Date(2026, 9, 28, 14, 5), now)).toBe('Today 14:05');
    expect(lastChangedText(new Date(2026, 9, 28, 0, 0), now)).toBe('Today 00:00');
    expect(lastChangedText(new Date(2026, 9, 27, 9, 12), now)).toBe('Yesterday 09:12');
  });

  it('gives the date for anything older, and across a month or year', () => {
    expect(lastChangedText(new Date(2026, 9, 26, 23, 59), now)).toBe('26 Oct 2026');
    expect(lastChangedText(new Date(2025, 11, 31, 8, 0), new Date(2026, 0, 1, 9, 0))).toBe(
      'Yesterday 08:00',
    );
    expect(lastChangedText(new Date(2025, 0, 3, 8, 0), now)).toBe('3 Jan 2025');
  });
});

describe('profileDeletionLines (PF-2)', () => {
  it('says how many classes and cards go with the profile', () => {
    expect(profileDeletionLines({ classes: 34, cards: 512 })).toEqual([
      "It has 34 classes and 512 cards. This can't be undone.",
    ]);
    expect(profileDeletionLines({ classes: 1, cards: 0 })).toEqual([
      "It has 1 class and 0 cards. This can't be undone.",
    ]);
  });

  it("says so when the profile's timetable can't be read", () => {
    expect(profileDeletionLines({ classes: null, cards: null })).toEqual([
      "Its timetable can't be read, and it's deleted as it is. This can't be undone.",
    ]);
  });
});
