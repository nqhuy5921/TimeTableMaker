import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import type { Card, Placement, TimetableFile } from '../../src/domain/model';
import {
  addTeacher,
  cleanPhone,
  deleteTeacher,
  editTeacher,
  isPhoneNumber,
  teacherCards,
  teacherClasses,
  teacherDeletion,
  teacherDeletionLines,
  teacherPeriods,
  teacherSubjects,
  teacherRows,
  type TeacherResult,
} from '../../src/domain/teachers';
import { fileProblem } from '../../src/domain/integrity';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

function ok(result: TeacherResult): TimetableFile {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

const card = (id: string, subjectId: string, teacherId: string | null, roomId: string | null) =>
  ({ id, subjectId, teacherId, roomId }) satisfies Card;
const placed = (id: string, cardId: string, classId: string, day: 0 | 1, part: Placement['part']) =>
  ({ id, cardId, classId, day, block: 0, part }) satisfies Placement;

// Two teachers, two classes, and cards that collide once Phúc is gone: his Toán in P101
// matches a Toán in P101 with no teacher, and his two Văn cards in no room match each other.
function school(): TimetableFile {
  return {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
    ],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', fullName: 'Tạ Văn Phúc', conditions: [] },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    rooms: [
      { id: 'p101', name: 'P101' },
      { id: 'p102', name: 'P102' },
    ],
    classes: [
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2, formTeacherId: 'phuc' },
      {
        id: 'c1',
        name: '6A1',
        grade: 6,
        track: 'A',
        section: 1,
        formTeacherId: 'lan',
        coTeacherId: 'phuc',
      },
    ],
    cards: [
      card('k-toan-none', 'toan', null, 'p101'),
      card('k-toan-phuc', 'toan', 'phuc', 'p101'),
      card('k-toan-phuc-102', 'toan', 'phuc', 'p102'),
      card('k-van-phuc', 'van', 'phuc', null),
      card('k-van-lan', 'van', 'lan', null),
    ],
    placements: [
      placed('p1', 'k-toan-phuc', 'c1', 0, 'full'),
      placed('p2', 'k-toan-none', 'c2', 0, 'full'),
      placed('p3', 'k-van-phuc', 'c1', 1, 'first'),
      placed('p4', 'k-toan-phuc-102', 'c2', 1, 'second'),
    ],
  };
}

describe('addTeacher (DM-1)', () => {
  it('adds a teacher with their details and no conditions', () => {
    const file = ok(
      addTeacher(
        createEmptyTimetable(),
        {
          shortName: ' T.  Hoa ',
          fullName: ' Trần Thị Hòa',
          email: ' hoa@school.edu.vn ',
          school: 'THPT',
        },
        () => 'hoa',
      ),
    );
    expect(file.teachers).toEqual([
      {
        id: 'hoa',
        shortName: 'T. Hoa',
        fullName: 'Trần Thị Hòa',
        email: 'hoa@school.edu.vn',
        school: 'THPT',
        conditions: [],
      },
    ]);
  });

  it('leaves empty details out', () => {
    const file = ok(
      addTeacher(
        createEmptyTimetable(),
        { shortName: 'Lan', fullName: ' ', email: '', school: null },
        () => 'lan',
      ),
    );
    expect(file.teachers).toEqual([{ id: 'lan', shortName: 'Lan', conditions: [] }]);
  });

  it('needs a short name no other teacher has, ignoring case but not accents', () => {
    expect(addTeacher(school(), { shortName: '  ' })).toEqual({
      ok: false,
      field: 'shortName',
      error: "Enter the teacher's short name.",
    });
    expect(addTeacher(school(), { shortName: 'cô lan' })).toEqual({
      ok: false,
      field: 'shortName',
      error: "There's already a teacher called Cô Lan.",
    });
    expect(addTeacher(school(), { shortName: 'Co Lan' }).ok).toBe(true);
  });

  it('refuses an email that does not look like one', () => {
    for (const email of ['hoa', 'hoa@', '@school', 'h oa@school']) {
      expect(addTeacher(school(), { shortName: 'Hoa', email })).toEqual({
        ok: false,
        field: 'email',
        error: 'Enter an email like name@school.edu.vn.',
      });
    }
  });
});

describe("a teacher's phone (DM-1, release 4)", () => {
  it('takes 8 to 15 digits split by spaces, dots, or dashes, after an optional +', () => {
    for (const phone of [
      '0912 345 678',
      '0912.345.678',
      '0912-345-678',
      '+84 912 345 678',
      '12345678',
      ' 0912345678 ',
      '0912 - 345 - 678',
      '0912\u00a0345\u00a0678',
      '0912\u2013345\u2013678',
    ]) {
      expect(isPhoneNumber(phone)).toBe(true);
    }
    for (const phone of [
      '',
      '1234567',
      '1234567890123456',
      '0912 345 67a',
      '84+912345678',
      '(091) 2345 678',
      '++84912345678',
      '-0912345678',
      '0912345678-',
      '+ 0912 345 678',
      '0912..345678',
      '0912 -- 345678',
    ]) {
      expect(isPhoneNumber(phone)).toBe(false);
    }
  });

  it('is kept with plain spaces and dashes, one space at a time', () => {
    expect(cleanPhone(' 0912\u00a0\u00a0345\t678 ')).toBe('0912 345 678');
    expect(cleanPhone('0912\u2013345\u2212678')).toBe('0912-345-678');
    const file = ok(addTeacher(school(), { shortName: 'Hoa', phone: '0912\u00a0345\u00a0678' }));
    expect(file.teachers[2]?.phone).toBe('0912 345 678');
  });

  it('is added trimmed, as typed', () => {
    const file = ok(
      addTeacher(
        createEmptyTimetable(),
        { shortName: 'Hoa', phone: ' 0912 345 678 ' },
        () => 'hoa',
      ),
    );
    expect(file.teachers).toEqual([
      { id: 'hoa', shortName: 'Hoa', phone: '0912 345 678', conditions: [] },
    ]);
  });

  it('can be changed and cleared', () => {
    const added = ok(
      addTeacher(school(), { shortName: 'Hoa', phone: '0912 345 678' }, () => 'hoa'),
    );
    const changed = ok(editTeacher(added, 'hoa', { shortName: 'Hoa', phone: '+84 98 765 4321' }));
    expect(changed.teachers[2]).toMatchObject({ phone: '+84 98 765 4321' });
    const cleared = ok(editTeacher(changed, 'hoa', { shortName: 'Hoa', phone: '  ' }));
    expect(cleared.teachers[2]).toEqual({ id: 'hoa', shortName: 'Hoa', conditions: [] });
  });

  it('refuses a phone that does not look like one, with its message', () => {
    expect(addTeacher(school(), { shortName: 'Hoa', phone: '0912 34' })).toEqual({
      ok: false,
      field: 'phone',
      error: 'Enter a phone number like 0912 345 678.',
    });
    expect(editTeacher(school(), 'lan', { shortName: 'Cô Lan', phone: 'none' })).toMatchObject({
      ok: false,
      field: 'phone',
    });
  });

  it('is found by the Teachers page search, with or without its spaces', () => {
    const file = ok(editTeacher(school(), 'lan', { shortName: 'Cô Lan', phone: '0912 345 678' }));
    for (const query of ['0912 345', '0912345678', '345.678', '345 678']) {
      expect(teacherRows(file, query).map((r) => r.teacher.id)).toEqual(['lan']);
    }
    expect(teacherRows(file, '0913').map((r) => r.teacher.id)).toEqual([]);
  });
});

describe('editTeacher (DM-1)', () => {
  it('changes the details and keeps the id and conditions', () => {
    const start = school();
    start.teachers[1] = {
      ...start.teachers[1]!,
      conditions: [{ id: 'cond', on: true, type: 'maxPeriodsPerDay', max: 6 }],
    };
    const file = ok(editTeacher(start, 'lan', { shortName: 'Cô Lan Anh', email: 'lan@school.vn' }));
    expect(file.teachers[1]).toEqual({
      id: 'lan',
      shortName: 'Cô Lan Anh',
      email: 'lan@school.vn',
      conditions: [{ id: 'cond', on: true, type: 'maxPeriodsPerDay', max: 6 }],
    });
    // Cards point at the teacher by id, so the new name shows on them.
    expect(teacherCards(file, 'lan').map((c) => c.teacher)).toEqual(['Cô Lan Anh']);
  });

  it('lets a teacher keep their own short name, but not take another', () => {
    expect(editTeacher(school(), 'lan', { shortName: 'CÔ LAN' }).ok).toBe(true);
    expect(editTeacher(school(), 'lan', { shortName: 'thầy phúc' })).toMatchObject({
      ok: false,
      field: 'shortName',
    });
  });

  it('refuses a teacher that is gone', () => {
    expect(editTeacher(school(), 'nobody', { shortName: 'X' }).ok).toBe(false);
  });
});

describe('deleteTeacher (DM-1)', () => {
  it('says which cards are affected and which merge', () => {
    const deletion = teacherDeletion(school(), 'phuc');
    expect(deletion.cards.map((c) => c.id)).toEqual([
      'k-toan-phuc',
      'k-toan-phuc-102',
      'k-van-phuc',
    ]);
    expect(deletion.placements).toBe(3);
    expect(deletion.merges.map((m) => [m.card.id, m.into.id])).toEqual([
      ['k-toan-phuc', 'k-toan-none'],
    ]);
    // Assistant homeroom teacher of 6A1 and homeroom teacher of 6A2, in class-bar order.
    expect(deletion.roles).toEqual([
      { className: '6A1', role: 'co' },
      { className: '6A2', role: 'form' },
    ]);
  });

  it('leaves the cards with no teacher, merges identical ones, and keeps every placement', () => {
    const file = deleteTeacher(school(), 'phuc');
    expect(file.teachers.map((t) => t.id)).toEqual(['lan']);
    expect(file.cards).toEqual([
      card('k-toan-none', 'toan', null, 'p101'),
      card('k-toan-phuc-102', 'toan', null, 'p102'),
      card('k-van-phuc', 'van', null, null),
      card('k-van-lan', 'van', 'lan', null),
    ]);
    // Every placement is still in its slot; the merged card's points at the card it merged into.
    expect(file.placements).toEqual([
      placed('p1', 'k-toan-none', 'c1', 0, 'full'),
      placed('p2', 'k-toan-none', 'c2', 0, 'full'),
      placed('p3', 'k-van-phuc', 'c1', 1, 'first'),
      placed('p4', 'k-toan-phuc-102', 'c2', 1, 'second'),
    ]);
    expect(fileProblem(file)).toBeNull();
  });

  it("never merges two of the teacher's own cards: they already differ by subject or room", () => {
    const start = school();
    start.cards = [card('a', 'van', 'phuc', null), card('b', 'van', 'phuc', 'p101')];
    start.placements = [];
    expect(teacherDeletion(start, 'phuc').merges).toEqual([]);
    expect(deleteTeacher(start, 'phuc').cards).toEqual([
      card('a', 'van', null, null),
      card('b', 'van', null, 'p101'),
    ]);
  });

  it('clears the teacher as homeroom teacher and assistant', () => {
    const file = deleteTeacher(school(), 'phuc');
    expect(file.classes).toEqual([
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1, formTeacherId: 'lan' },
    ]);
  });

  it('changes nothing for a teacher that is gone', () => {
    const start = school();
    expect(deleteTeacher(start, 'nobody')).toBe(start);
  });
});

describe('teacherDeletionLines (DM-1, layout spec "Delete questions")', () => {
  it('says what happens to the cards, the merges, the classes, and the conditions', () => {
    const start = school();
    start.teachers[0] = {
      ...start.teachers[0]!,
      conditions: [{ id: 'a', on: true, type: 'maxPeriodsPerDay', max: 6 }],
    };
    expect(teacherDeletionLines(start, 'phuc')).toEqual([
      "3 cards use Thầy Phúc. They'll be left with no teacher and stay on the grid where they are.",
      "Toán · P101 becomes the same as a card that has no teacher, so the two are merged, keeping both cards' places on the grid.",
      'Thầy Phúc stops being homeroom teacher of 6A2 and assistant homeroom teacher of 6A1.',
      'Their condition goes too.',
      "This can't be undone.",
    ]);
  });

  it('has wordings for one card, no cards, and several conditions', () => {
    const start = school();
    start.teachers[1] = {
      ...start.teachers[1]!,
      conditions: [
        { id: 'a', on: true, type: 'maxPeriodsPerDay', max: 6 },
        { id: 'b', on: false, type: 'maxPeriodsPerDay', max: 4 },
      ],
    };
    expect(teacherDeletionLines(start, 'lan')).toEqual([
      "1 card uses Cô Lan. It'll be left with no teacher and stay on the grid where it is.",
      'Cô Lan stops being homeroom teacher of 6A1.',
      'Their 2 conditions go too.',
      "This can't be undone.",
    ]);
    start.cards = [];
    expect(teacherDeletionLines(start, 'lan')[0]).toBe('No cards use this teacher.');
    expect(teacherDeletionLines(start, 'nobody')).toEqual([]);
  });
});

describe('the Teachers page and teacher detail (DM-1)', () => {
  it('counts periods across all classes: 2 for a full block, 1 for a half', () => {
    expect(teacherPeriods(school(), 'phuc')).toBe(2 + 1 + 1);
    expect(teacherPeriods(school(), 'lan')).toBe(0);
  });

  it('lists teachers in list order with their counts, and searches ignoring accents', () => {
    const start = school();
    start.teachers[0] = {
      ...start.teachers[0]!,
      conditions: [
        { id: 'a', on: true, type: 'maxPeriodsPerDay', max: 6 },
        { id: 'b', on: false, type: 'daysOff', days: [2] },
      ],
    };
    expect(teacherRows(start, '')).toEqual([
      { teacher: start.teachers[0], cards: 3, periods: 4, conditions: 2, conditionsOff: 1 },
      { teacher: start.teachers[1], cards: 1, periods: 0, conditions: 0, conditionsOff: 0 },
    ]);
    expect(teacherRows(start, 'ta van').map((r) => r.teacher.id)).toEqual(['phuc']);
    expect(teacherRows(start, 'co lan').map((r) => r.teacher.id)).toEqual(['lan']);
    expect(teacherRows(start, 'nobody')).toEqual([]);
  });

  it("lists a teacher's cards with their classes, and the classes in class-bar order", () => {
    expect(teacherCards(school(), 'phuc').map((c) => [c.id, c.room, c.classes])).toEqual([
      ['k-toan-phuc', 'P101', ['6A1']],
      ['k-toan-phuc-102', 'P102', ['6A2']],
      ['k-van-phuc', null, ['6A1']],
    ]);
    expect(teacherClasses(school(), 'phuc')).toEqual(['6A1', '6A2']);
    // Class-bar order is grade, then track (A, AA, CE, B, BA), then section, whatever order
    // the classes were added in.
    const mixed = school();
    mixed.classes.unshift(
      { id: 'c8', name: '8CE1', grade: 8, track: 'CE', section: 1 },
      { id: 'c6aa', name: '6AA1', grade: 6, track: 'AA', section: 1 },
    );
    mixed.placements.push(
      placed('p8', 'k-van-phuc', 'c8', 0, 'full'),
      placed('p6aa', 'k-van-phuc', 'c6aa', 0, 'full'),
    );
    expect(teacherClasses(mixed, 'phuc')).toEqual(['6A1', '6A2', '6AA1', '8CE1']);
    expect(teacherClasses(school(), 'lan')).toEqual([]);
  });
});

describe('teacherSubjects (the condition form, 2026-10-23)', () => {
  it("lists the subjects of the teacher's cards once each, in subject-list order", () => {
    expect(teacherSubjects(school(), 'phuc').map((s) => s.id)).toEqual(['toan', 'van']);
    expect(teacherSubjects(school(), 'lan').map((s) => s.id)).toEqual(['van']);
  });

  it('is empty for a teacher with no cards, and keeps a subject being edited', () => {
    const start = school();
    start.cards = start.cards.filter((c) => c.teacherId !== 'lan');
    expect(teacherSubjects(start, 'lan')).toEqual([]);
    expect(teacherSubjects(start, 'lan', 'toan').map((s) => s.id)).toEqual(['toan']);
  });
});
