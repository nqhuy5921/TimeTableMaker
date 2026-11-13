import { describe, expect, it } from 'vitest';
import { classNameHint, parseClassName } from '../../src/domain/className';

describe('parseClassName (DM-2)', () => {
  it.each([
    ['6A1', 6, 'A', 1],
    ['6AA1', 6, 'AA', 1],
    ['8CE1', 8, 'CE', 1],
    ['7B1', 7, 'B', 1],
    ['9BA1', 9, 'BA', 1],
    ['8A12', 8, 'A', 12],
    ['1A1', 1, 'A', 1],
    ['5A1', 5, 'A', 1],
    ['10A1', 10, 'A', 1],
    ['12BA3', 12, 'BA', 3],
  ])('reads %s as grade %i, track %s, section %i', (name, grade, track, section) => {
    expect(parseClassName(name)).toEqual({ name, grade, track, section });
  });

  it('ignores spaces around the name', () => {
    expect(parseClassName('  6A2 ')?.name).toBe('6A2');
  });

  it.each(['0A1', '13A1', '06A1', '6C1', '6A', '6A0', '6a1', 'A61', '6 A1', ''])(
    'rejects %j',
    (name) => {
      expect(parseClassName(name)).toBeNull();
    },
  );
});

describe('classNameHint (DM-8)', () => {
  it('names the grades there are', () => {
    expect(classNameHint([6, 7, 8, 9])).toBe(
      'Grade 6, 7, 8, or 9, a track, and a section, as in 6A1 or 8CE2.',
    );
    expect(classNameHint([10, 11])).toBe(
      'Grade 10 or 11, a track, and a section, as in 10A1 or 11CE2.',
    );
    expect(classNameHint([10, 11, 12])).toBe(
      'Grade 10, 11, or 12, a track, and a section, as in 10A1 or 12CE2.',
    );
    expect(classNameHint([10])).toBe('Grade 10, a track, and a section, as in 10A1 or 10CE2.');
    expect(classNameHint([])).toBe('A grade, a track, and a section, as in 6A1 or 8CE2.');
  });
});
