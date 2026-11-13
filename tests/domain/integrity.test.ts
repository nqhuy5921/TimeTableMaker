import { describe, expect, it } from 'vitest';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { fileProblem } from '../../src/domain/integrity';
import type { TimetableFile } from '../../src/domain/model';
import { timetableFileSchema } from '../../src/shared/schema';

// A loaded or saved file must hold together beyond the shape of each record (TB-7, R1-9).

const school = exampleSchool;
const message = (file: TimetableFile) => fileProblem(file)?.message;

describe('fileProblem', () => {
  it('finds nothing wrong with the sample school', () => {
    expect(fileProblem(school)).toBeNull();
  });

  it('wants each of the five blocks once in the bell schedule', () => {
    const noLastBlock = school.bellSchedule.filter((r) => !(r.kind === 'block' && r.block === 4));
    expect(message({ ...school, bellSchedule: noLastBlock })).toBe(
      'the bell schedule has periods 9–10 0 times',
    );
  });

  it('refuses an id used twice in a list', () => {
    const [first] = school.rooms;
    expect(
      fileProblem({ ...school, rooms: [...school.rooms, { ...first!, name: 'P999' }] }),
    ).toEqual({ path: ['rooms', 6, 'id'], message: 'the id r-p101 is used twice' });
  });

  it('wants a class name that matches its grade, track, and section, used once', () => {
    const [sixA1, ...rest] = school.classes;
    expect(message({ ...school, classes: [{ ...sixA1!, grade: 9 }, ...rest] })).toBe(
      "class 6A1 doesn't match its grade, track, and section",
    );
    expect(message({ ...school, classes: [{ ...sixA1!, name: '6a1' }, ...rest] })).toMatch(
      /doesn't match/,
    );
    expect(message({ ...school, classes: [...school.classes, { ...sixA1!, id: 'c-copy' }] })).toBe(
      'there are two classes called 6A1',
    );
    expect(message({ ...school, classes: [{ ...sixA1!, formTeacherId: 't-gone' }, ...rest] })).toBe(
      'class 6A1 names a missing teacher',
    );
  });

  it('wants the grade list in order with no repeats, and every class in a listed grade (DM-8)', () => {
    expect(fileProblem({ ...school, grades: [6, 8, 7, 9] })).toEqual({
      path: ['grades', 2],
      message: 'the grades are out of order or repeated',
    });
    expect(message({ ...school, grades: [6, 7, 7, 8, 9] })).toBe(
      'the grades are out of order or repeated',
    );
    expect(fileProblem({ ...school, grades: [6, 7, 8] })).toMatchObject({
      path: ['classes', school.classes.findIndex((c) => c.grade === 9), 'grade'],
      message: expect.stringMatching(/is in grade 9, which isn't in the grade list$/),
    });
    // A grade with no classes is fine.
    expect(fileProblem({ ...school, grades: [1, 6, 7, 8, 9, 12] })).toBeNull();
  });

  it("refuses a card that points at something that isn't there", () => {
    const [card, ...rest] = school.cards;
    const withCard = (changes: object) => ({
      ...school,
      cards: [{ ...card!, ...changes }, ...rest],
    });
    expect(fileProblem(withCard({ subjectId: 's-gone' }))?.path).toEqual(['cards', 0, 'subjectId']);
    expect(fileProblem(withCard({ teacherId: 't-gone' }))?.path).toEqual(['cards', 0, 'teacherId']);
    expect(message(withCard({ roomId: 'r-gone' }))).toBe(
      "card k-6a1-toan points at a room that isn't in the file",
    );
    // An empty teacher and room are fine (DM-5).
    expect(fileProblem(withCard({ teacherId: null, roomId: null }))).toBeNull();
  });

  it('refuses two cards with the same subject, teacher, and room', () => {
    const copy = { ...school.cards[0]!, id: 'k-copy' };
    expect(fileProblem({ ...school, cards: [...school.cards, copy] })).toEqual({
      path: ['cards', school.cards.length],
      message: 'cards k-6a1-toan and k-copy are the same card',
    });
  });

  it('allows two cards of one subject on one grid', () => {
    const second = { ...school.cards[0]!, id: 'k-toan-2', teacherId: 't-quan' };
    const placement = {
      id: 'p-toan-2',
      cardId: 'k-toan-2',
      classId: 'c-6a1',
      day: 3,
      block: 4,
      part: 'full',
    } as const;
    expect(
      fileProblem({
        ...school,
        cards: [...school.cards, second],
        placements: [...school.placements, placement],
      }),
    ).toBeNull();
  });

  it("refuses a placement in a class that isn't there", () => {
    const [first, ...rest] = school.placements;
    expect(
      fileProblem({ ...school, placements: [{ ...first!, classId: 'c-gone' }, ...rest] }),
    ).toEqual({
      path: ['placements', 0, 'classId'],
      message: "placement p-6a1-1 is in a class that isn't in the file",
    });
  });

  it("refuses a placement of a card that isn't there", () => {
    const stray = {
      id: 'p-stray',
      cardId: 'k-gone',
      classId: 'c-6a1',
      day: 0,
      block: 0,
      part: 'full',
    } as const;
    expect(message({ ...school, placements: [...school.placements, stray] })).toBe(
      "placement p-stray is of a card that isn't in the file",
    );
  });

  it('refuses slots the drop table could never make', () => {
    // 6A1's Monday 1–2 holds a full Toán block.
    const onMonday = (part: 'full' | 'first') =>
      ({ id: 'p-extra', cardId: 'k-6a1-van', classId: 'c-6a1', day: 0, block: 0, part }) as const;
    for (const part of ['full', 'first'] as const) {
      expect(message({ ...school, placements: [...school.placements, onMonday(part)] })).toBe(
        'placement p-extra overlaps another card in its slot',
      );
    }
    // A second half in 6A1's Wednesday 1–2, next to Tin học in the first, is fine.
    const second = {
      id: 'p-ok',
      cardId: 'k-6a1-van',
      classId: 'c-6a1',
      day: 2,
      block: 0,
      part: 'second',
    } as const;
    expect(fileProblem({ ...school, placements: [...school.placements, second] })).toBeNull();
    // The same block in another class is another slot.
    const other = {
      id: 'p-ok',
      cardId: 'k-9b1-toan',
      classId: 'c-9b1',
      day: 0,
      block: 0,
      part: 'full',
    } as const;
    expect(fileProblem({ ...school, placements: [...school.placements, other] })).toBeNull();
  });
});

describe('timetableFileSchema with fileProblem', () => {
  it('refuses a file that does not hold together, naming where', () => {
    const [card, ...rest] = school.cards;
    const parsed = timetableFileSchema.safeParse({
      ...school,
      cards: [{ ...card!, subjectId: 's-gone' }, ...rest],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ['cards', 0, 'subjectId'] });
  });

  it("refuses teachers' conditions that repeat an id, name a missing subject, or break the allowed values (release 2)", () => {
    const withConditions = (...conditions: TimetableFile['teachers'][number]['conditions']) => ({
      ...school,
      teachers: school.teachers.map((t, i) => (i === 0 ? { ...t, conditions } : t)),
    });
    const ok = withConditions(
      {
        id: 'a',
        on: true,
        type: 'subjectLimit',
        subjectId: school.subjects[0]!.id,
        max: 3,
        per: 'day',
      },
      { id: 'b', on: false, type: 'unavailable', blocks: [3, 4], days: [0, 2] },
      { id: 'c', on: true, type: 'daysOff', days: [2] },
      { id: 'd', on: true, type: 'maxGapsPerDay', max: 0 },
      { id: 'e', on: true, type: 'maxPeriodsPerWeek', max: 50 },
    );
    expect(fileProblem(ok)).toBeNull();

    const twice = withConditions(
      { id: 'a', on: true, type: 'maxPeriodsPerDay', max: 6 },
      { id: 'a', on: true, type: 'maxTeachingDays', max: 4 },
    );
    expect(message(twice)).toBe('the condition id a is used twice');
    expect(
      fileProblem(
        withConditions({
          id: 'a',
          on: true,
          type: 'subjectLimit',
          subjectId: 'gone',
          max: 3,
          per: 'week',
        }),
      ),
    ).toEqual({
      path: ['teachers', 0, 'conditions', 0, 'subjectId'],
      message: "a condition of Cô Ngân names a subject that isn't in the file",
    });
    expect(message(withConditions({ id: 'a', on: true, type: 'maxBlocksInRow', max: 4 }))).toBe(
      "a condition of Cô Ngân is wrong: its number 4 isn't from 1 to 3",
    );
    expect(
      message(
        withConditions({
          id: 'a',
          on: true,
          type: 'subjectLimit',
          subjectId: school.subjects[0]!.id,
          max: 11,
          per: 'day',
        }),
      ),
    ).toMatch(/isn't from 1 to 10/);
    expect(message(withConditions({ id: 'a', on: true, type: 'daysOff', days: [] }))).toMatch(
      /days are empty/,
    );
    expect(message(withConditions({ id: 'a', on: true, type: 'daysOff', days: [2, 1] }))).toMatch(
      /out of order/,
    );
    expect(
      message(
        withConditions({ id: 'a', on: true, type: 'unavailable', blocks: [1, 1], days: [0] }),
      ),
    ).toMatch(/blocks are empty, repeated/);
    // The file schema runs the same check when a file is read.
    expect(timetableFileSchema.safeParse(twice).success).toBe(false);
  });
});
