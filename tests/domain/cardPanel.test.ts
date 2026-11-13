import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  cardFilterGrades,
  cardPanelGroups,
  cardTableRows,
  currentCardFilter,
  type CardTableFilter,
} from '../../src/domain/cardPanel';
import { poolCards } from '../../src/domain/cards';
import type { Card, Placement, TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

function card(id: string, subjectId: string, teacherId: string | null): Card {
  return { id, subjectId, teacherId, roomId: null };
}

/** A pool of five cards: Lan teaches two, T. Hoa two, and one has no teacher. */
function school(): TimetableFile {
  return {
    ...createEmptyTimetable(),
    classes: [
      { id: '6A1', name: '6A1', grade: 6, track: 'A', section: 1 },
      { id: '7B2', name: '7B2', grade: 7, track: 'B', section: 2 },
    ],
    subjects: [
      { id: 'math', name: 'Toán', colorKey: 'math' },
      { id: 'lit', name: 'Ngữ văn', colorKey: 'literature' },
      { id: 'geo', name: 'Địa lý', colorKey: 'geography' },
      { id: 'home', name: 'SH lớp', colorKey: 'homeroom' },
    ],
    teachers: [
      { id: 'hoa', shortName: 'T. Hoa', fullName: 'Trần Thị Hòa', conditions: [] },
      { id: 'lan', shortName: 'Lan', conditions: [] },
    ],
    // Added out of subject order.
    cards: [
      card('c-home', 'home', null),
      card('c-geo', 'geo', 'lan'),
      card('c-math', 'math', 'lan'),
      card('c-lit', 'lit', 'hoa'),
      card('c-other', 'math', 'hoa'),
    ],
  };
}

function ids(groups: ReturnType<typeof cardPanelGroups>): string[][] {
  return groups.map((group) => group.cards.map((c) => c.id));
}

describe('cardPanelGroups: search (DM-7)', () => {
  it('lists the whole pool in pool order when the search is empty', () => {
    expect(ids(cardPanelGroups(school(), '', 'subject'))).toEqual([
      ['c-other', 'c-math', 'c-lit', 'c-geo', 'c-home'],
    ]);
    expect(ids(cardPanelGroups(school(), '   ', 'subject'))).toEqual([
      ['c-other', 'c-math', 'c-lit', 'c-geo', 'c-home'],
    ]);
  });

  it('finds Toán when searching "toan"', () => {
    expect(ids(cardPanelGroups(school(), 'toan', 'subject'))).toEqual([['c-other', 'c-math']]);
  });

  it('ignores case and accents, including đ', () => {
    expect(ids(cardPanelGroups(school(), 'DIA', 'subject'))).toEqual([['c-geo']]);
    expect(ids(cardPanelGroups(school(), 'văn', 'subject'))).toEqual([['c-lit']]);
  });

  it("matches the teacher's short name or full name", () => {
    expect(ids(cardPanelGroups(school(), 'lan', 'subject'))).toEqual([['c-math', 'c-geo']]);
    expect(ids(cardPanelGroups(school(), 'tran thi', 'subject'))).toEqual([['c-other', 'c-lit']]);
  });

  it('returns no groups when nothing matches', () => {
    expect(cardPanelGroups(school(), 'hóa học', 'subject')).toEqual([]);
  });
});

describe('cardPanelGroups: grouping (DM-7)', () => {
  it('groups by subject as one list with no heading', () => {
    const groups = cardPanelGroups(school(), '', 'subject');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.heading).toBeNull();
  });

  it('groups by teacher in teacher order, with cards in subject order and no teacher last', () => {
    const groups = cardPanelGroups(school(), '', 'teacher');
    expect(groups.map((g) => g.heading)).toEqual(['T. Hoa', 'Lan', 'No teacher']);
    expect(ids(groups)).toEqual([['c-other', 'c-lit'], ['c-math', 'c-geo'], ['c-home']]);
  });

  it('leaves out teachers with no matching cards', () => {
    const groups = cardPanelGroups(school(), 'toan', 'teacher');
    expect(groups.map((g) => g.heading)).toEqual(['T. Hoa', 'Lan']);
    expect(ids(groups)).toEqual([['c-other'], ['c-math']]);
  });

  it('gives each group a key that stays the same across searches', () => {
    const all = cardPanelGroups(school(), '', 'teacher');
    const some = cardPanelGroups(school(), 'toan', 'teacher');
    expect(some[1]!.key).toBe(all[1]!.key);
    expect(new Set(all.map((g) => g.key)).size).toBe(all.length);
  });
});

describe('cardTableRows (DM-7, the Cards page)', () => {
  const place = (id: string, cardId: string, classId: string): Placement => ({
    id,
    cardId,
    classId,
    day: 0,
    block: 0,
    part: 'full',
  });

  /** The pool above, with c-math on 7B2 and 6A1 (in that order in the file), c-lit on 6A1. */
  function placedSchool(): TimetableFile {
    return {
      ...school(),
      placements: [
        place('p1', 'c-math', '7B2'),
        place('p2', 'c-math', '6A1'),
        place('p3', 'c-lit', '6A1'),
      ],
    };
  }

  const rowIds = (file: TimetableFile, query: string) =>
    cardTableRows(file, query).map((row) => row.id);

  it('lists the pool in pool order', () => {
    expect(rowIds(school(), '')).toEqual(poolCards(school()).map((c) => c.id));
    expect(rowIds(school(), '')).toEqual(['c-other', 'c-math', 'c-lit', 'c-geo', 'c-home']);
  });

  it("gives each row the card's details and its class names in class-bar order", () => {
    expect(cardTableRows(placedSchool(), '')[1]).toEqual({
      id: 'c-math',
      subject: 'Toán',
      colors: { key: 'math', custom: null },
      teacher: 'Lan',
      room: null,
      classes: ['6A1', '7B2'],
    });
  });

  it("has no classes for a card that isn't placed", () => {
    expect(cardTableRows(placedSchool(), '').at(-1)).toMatchObject({ id: 'c-home', classes: [] });
  });

  it('searches by class name, subject, or teacher, ignoring case and accents', () => {
    expect(rowIds(placedSchool(), '7b')).toEqual(['c-math']);
    expect(rowIds(placedSchool(), '6a1')).toEqual(['c-math', 'c-lit']);
    expect(rowIds(placedSchool(), '6a2')).toEqual([]);
    expect(rowIds(placedSchool(), 'toan')).toEqual(['c-other', 'c-math']);
    expect(rowIds(placedSchool(), 'hoa')).toEqual(['c-other', 'c-lit']);
    expect(rowIds(placedSchool(), 'nobody')).toEqual([]);
  });

  it('is empty with an empty pool', () => {
    expect(cardTableRows(createEmptyTimetable(), '')).toEqual([]);
  });

  describe('filters by grade and teacher (asked for on 2026-10-21)', () => {
    const filtered = (filter: Partial<CardTableFilter>, query = '') =>
      cardTableRows(placedSchool(), query, { ...ALL_CARDS, ...filter }).map((row) => row.id);

    it('shows every card with no filter', () => {
      expect(filtered({})).toEqual(rowIds(placedSchool(), ''));
    });

    it('by grade: cards placed in any class of that grade', () => {
      expect(filtered({ grade: 6 })).toEqual(['c-math', 'c-lit']);
      expect(filtered({ grade: 7 })).toEqual(['c-math']);
      expect(filtered({ grade: 9 })).toEqual([]);
    });

    it('"Not placed": cards on no grid', () => {
      expect(filtered({ grade: 'unplaced' })).toEqual(['c-other', 'c-geo', 'c-home']);
    });

    it("by teacher, or cards with no teacher (or one that's no longer listed)", () => {
      expect(filtered({ teacher: 'lan' })).toEqual(['c-math', 'c-geo']);
      const withGone: TimetableFile = {
        ...placedSchool(),
        cards: [...placedSchool().cards, card('c-gone', 'geo', 'left-school')],
      };
      expect(
        cardTableRows(withGone, '', { ...ALL_CARDS, teacher: 'none' }).map((row) => row.id),
      ).toEqual(['c-gone', 'c-home']);
    });

    it('combines the filters and the search', () => {
      expect(filtered({ grade: 6, teacher: 'hoa' })).toEqual(['c-lit']);
      expect(filtered({ grade: 'unplaced', teacher: 'lan' })).toEqual(['c-geo']);
      expect(filtered({ teacher: 'hoa' }, 'toan')).toEqual(['c-other']);
    });
  });

  it('puts a grade or teacher that is no longer offered back to all', () => {
    expect(currentCardFilter(school(), { grade: 9, teacher: 'gone' })).toEqual(ALL_CARDS);
    expect(currentCardFilter(school(), { grade: 6, teacher: 'lan' })).toEqual({
      grade: 6,
      teacher: 'lan',
    });
    expect(currentCardFilter(school(), { grade: 'unplaced', teacher: 'none' })).toEqual({
      grade: 'unplaced',
      teacher: 'none',
    });
  });

  it('offers the grades that have classes, in order', () => {
    expect(cardFilterGrades(school())).toEqual([6, 7]);
    expect(cardFilterGrades(createEmptyTimetable())).toEqual([]);
  });

  it('offers grades in number order, so Grade 9 comes before Grade 10 (DM-8)', () => {
    const named = (id: string, name: string, grade: number) =>
      ({ id, name, grade, track: 'A', section: 1 }) as const;
    const file = {
      ...createEmptyTimetable(),
      grades: [2, 9, 10],
      classes: [named('c10', '10A1', 10), named('c2', '2A1', 2), named('c9', '9A1', 9)],
    };
    expect(cardFilterGrades(file)).toEqual([2, 9, 10]);
  });
});
