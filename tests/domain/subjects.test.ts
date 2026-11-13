import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { fileProblem } from '../../src/domain/integrity';
import { addSubject } from '../../src/domain/lists';
import type { Card, Placement, TeacherCondition, TimetableFile } from '../../src/domain/model';
import {
  deleteSubject,
  editSubject,
  subjectDeletion,
  subjectDeletionLines,
  subjectRows,
  type SubjectResult,
} from '../../src/domain/subjects';

function ok(result: SubjectResult): TimetableFile {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

const card = (id: string, subjectId: string, teacherId: string | null) =>
  ({ id, subjectId, teacherId, roomId: null }) satisfies Card;
const placed = (id: string, cardId: string, classId: string, day: 0 | 1, part: Placement['part']) =>
  ({ id, cardId, classId, day, block: 0, part }) satisfies Placement;
const limit = (id: string, subjectId: string, on = true): TeacherCondition => ({
  id,
  on,
  type: 'subjectLimit',
  subjectId,
  max: 2,
  per: 'day',
});

// Four subjects. Toán has two cards, placed in 7B1 and 6A1 (three times in all) and named by
// Thầy Phúc's subject limit; Tin học has one card that isn't placed; Địa lý has none.
function school(): TimetableFile {
  return {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
      { id: 'tin', name: 'Tin học', colorKey: 'informatics' },
      { id: 'dia', name: 'Địa lý', colorKey: 'geography' },
    ],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', conditions: [limit('l1', 'toan')] },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    classes: [
      { id: 'c7', name: '7B1', grade: 7, track: 'B', section: 1 },
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    ],
    cards: [
      card('k-toan-phuc', 'toan', 'phuc'),
      card('k-toan-lan', 'toan', 'lan'),
      card('k-van', 'van', 'lan'),
      card('k-tin', 'tin', null),
    ],
    placements: [
      placed('p1', 'k-toan-phuc', 'c7', 0, 'full'),
      placed('p2', 'k-toan-lan', 'c1', 0, 'full'),
      placed('p3', 'k-van', 'c1', 1, 'first'),
      placed('p4', 'k-toan-phuc', 'c1', 1, 'second'),
    ],
  };
}

/** The school with Thầy Phúc's subject limit gone, so Toán can be deleted. */
function noLimits(): TimetableFile {
  const file = school();
  return { ...file, teachers: file.teachers.map((t) => ({ ...t, conditions: [] })) };
}

describe('subjectRows (DM-4)', () => {
  it('lists subjects in subject order with how many cards each has', () => {
    expect(subjectRows(school(), '').map((r) => [r.subject.name, r.cards])).toEqual([
      ['Toán', 2],
      ['Ngữ văn', 1],
      ['Tin học', 1],
      ['Địa lý', 0],
    ]);
  });

  it('searches by subject name, ignoring case and accents', () => {
    expect(subjectRows(school(), 'dia').map((r) => r.subject.name)).toEqual(['Địa lý']);
    expect(subjectRows(school(), ' TOAN ').map((r) => r.subject.name)).toEqual(['Toán']);
    expect(subjectRows(school(), 'Sinh')).toEqual([]);
  });
});

describe('editSubject (DM-4)', () => {
  it('renames a subject, keeping its id, and its palette follows the new name', () => {
    const file = ok(editSubject(school(), 'dia', '  Lịch  sử '));
    expect(file.subjects[3]).toEqual({ id: 'dia', name: 'Lịch sử', colorKey: 'history' });
    expect(file.cards).toEqual(school().cards);
  });

  it('keeps a picked palette and custom colors through a rename (SYSTEM_DESIGN §10.5)', () => {
    const picked = ok(editSubject(school(), 'dia', 'Địa lý', { source: 'palette', key: 'music' }));
    expect(picked.subjects[3]).toEqual({
      id: 'dia',
      name: 'Địa lý',
      colorKey: 'music',
      colorSource: 'palette',
    });
    expect(ok(editSubject(picked, 'dia', 'Lịch sử')).subjects[3]).toMatchObject({
      name: 'Lịch sử',
      colorKey: 'music',
      colorSource: 'palette',
    });

    const custom = ok(
      editSubject(school(), 'dia', 'Địa lý', { source: 'custom', bg: '#FFEEDD', ink: '#112233' }),
    );
    // The palette it had stays underneath, for switching back from Custom.
    expect(custom.subjects[3]).toEqual({
      id: 'dia',
      name: 'Địa lý',
      colorKey: 'geography',
      colorSource: 'custom',
      customColors: { bg: '#ffeedd', ink: '#112233' },
    });
    expect(ok(editSubject(custom, 'dia', 'Toán học')).subjects[3]).toMatchObject({
      colorKey: 'geography',
      customColors: { bg: '#ffeedd', ink: '#112233' },
    });
  });

  it('goes back to the name’s colors, which then follow a rename', () => {
    const picked = ok(editSubject(school(), 'dia', 'Địa lý', { source: 'palette', key: 'music' }));
    const back = ok(editSubject(picked, 'dia', 'Lịch sử', { source: 'name' }));
    expect(back.subjects[3]).toEqual({ id: 'dia', name: 'Lịch sử', colorKey: 'history' });
  });

  it('refuses custom colors that are not #rrggbb, changing nothing', () => {
    expect(
      editSubject(school(), 'dia', 'Địa lý', { source: 'custom', bg: 'red', ink: '#112233' }),
    ).toEqual({ ok: false, error: 'Colors are written as #rrggbb, such as #1b3c7a.' });
    expect(
      addSubject(school(), 'Sinh', { source: 'custom', bg: '#fff', ink: '#000000' }),
    ).toMatchObject({ ok: false });
  });

  it('keeps a from-the-name subject’s palette while its name stays, even one not the name’s', () => {
    const start = school();
    start.subjects[0] = { id: 'toan', name: 'Toán', colorKey: 'art' };
    expect(ok(editSubject(start, 'toan', 'Toán'))).toBe(start);
    expect(ok(editSubject(start, 'toan', 'Toán', { source: 'name' }))).toBe(start);
    // A new name takes the new name's palette.
    expect(ok(editSubject(start, 'toan', 'Toán học')).subjects[0]?.colorKey).toBe('homeroom');
  });

  it('keeps the same file when the colors chosen are the ones it has', () => {
    const picked = ok(editSubject(school(), 'dia', 'Địa lý', { source: 'palette', key: 'music' }));
    expect(ok(editSubject(picked, 'dia', 'Địa lý', { source: 'palette', key: 'music' }))).toBe(
      picked,
    );
    const start = school();
    expect(ok(editSubject(start, 'dia', 'Địa lý', { source: 'name' }))).toBe(start);
  });

  it('gives an unknown name the neutral palette', () => {
    expect(ok(editSubject(school(), 'tin', 'Robotics')).subjects[2]?.colorKey).toBe('homeroom');
  });

  it('allows its own name in another case', () => {
    expect(ok(editSubject(school(), 'toan', 'TOÁN')).subjects[0]?.name).toBe('TOÁN');
  });

  it("refuses an empty name or one another subject has (case doesn't count, accents do)", () => {
    expect(editSubject(school(), 'tin', '  ')).toEqual({
      ok: false,
      error: 'Enter a subject name.',
    });
    expect(editSubject(school(), 'tin', 'toán')).toEqual({
      ok: false,
      error: "There's already a subject called Toán.",
    });
    expect(ok(editSubject(school(), 'tin', 'Toan')).subjects[2]?.name).toBe('Toan');
  });

  it('keeps the same file when the name is unchanged, so nothing is saved', () => {
    const start = school();
    expect(ok(editSubject(start, 'toan', ' Toán '))).toBe(start);
  });

  it('refuses a subject that is gone', () => {
    expect(editSubject(school(), 'nowhere', 'Sinh')).toMatchObject({ ok: false });
  });

  it('adds with the name’s colors, or the colors the form picks', () => {
    const named = addSubject(school(), 'Âm nhạc', undefined, () => 'nhac');
    expect(named.ok && named.file.subjects[4]).toEqual({
      id: 'nhac',
      name: 'Âm nhạc',
      colorKey: 'music',
    });
    const custom = addSubject(
      school(),
      'Robotics',
      { source: 'custom', bg: '#ffeedd', ink: '#112233' },
      () => 'rb',
    );
    expect(custom.ok && custom.file.subjects[4]).toEqual({
      id: 'rb',
      name: 'Robotics',
      colorKey: 'homeroom',
      colorSource: 'custom',
      customColors: { bg: '#ffeedd', ink: '#112233' },
    });
  });

  it('shares the name rule with addSubject', () => {
    expect(addSubject(school(), 'TIN HỌC')).toEqual({
      ok: false,
      error: "There's already a subject called Tin học.",
    });
  });
});

describe('subjectDeletion (DM-4)', () => {
  it('says which teachers name it, its cards, how many placements, and which classes', () => {
    const deletion = subjectDeletion(school(), 'toan');
    expect(deletion.limits.map((l) => [l.teacher.shortName, l.count])).toEqual([['Thầy Phúc', 1]]);
    expect(deletion.cards.map((c) => c.id)).toEqual(['k-toan-phuc', 'k-toan-lan']);
    expect(deletion.placements).toBe(3);
    expect(deletion.classes.map((c) => c.name)).toEqual(['6A1', '7B1']);
  });

  it('counts switched-off limits, and only subject limits on that subject', () => {
    const file = school();
    file.teachers[0]!.conditions.push(limit('l2', 'toan', false));
    file.teachers[1]!.conditions.push(limit('l3', 'van'), {
      id: 'l4',
      on: true,
      type: 'maxPeriodsPerDay',
      max: 6,
    });
    expect(subjectDeletion(file, 'toan').limits.map((l) => [l.teacher.id, l.count])).toEqual([
      ['phuc', 2],
    ]);
    expect(subjectDeletion(file, 'van').limits.map((l) => l.teacher.id)).toEqual(['lan']);
    expect(subjectDeletion(file, 'tin').limits).toEqual([]);
  });

  it('has nothing for a subject nothing uses', () => {
    expect(subjectDeletion(school(), 'dia')).toEqual({
      limits: [],
      cards: [],
      placements: 0,
      classes: [],
    });
  });
});

describe('deleteSubject (DM-4)', () => {
  it('deletes the subject limits naming it, on or off, and leaves the other conditions (SYSTEM_DESIGN §10.5)', () => {
    const start = school();
    start.teachers[0]!.conditions.push(limit('l2', 'toan', false), limit('l3', 'van'));
    const lan = start.teachers[1]!;
    const file = deleteSubject(start, 'toan');
    expect(file.teachers[0]!.conditions.map((c) => c.id)).toEqual(['l3']);
    // A teacher with no limit on it keeps the same object.
    expect(file.teachers[1]).toBe(lan);
    expect(file.cards.map((c) => c.id)).toEqual(['k-van', 'k-tin']);
    expect(fileProblem(file)).toBeNull();
  });

  it('removes the subject, its cards, and their placements', () => {
    const file = deleteSubject(noLimits(), 'toan');
    expect(file.subjects.map((s) => s.id)).toEqual(['van', 'tin', 'dia']);
    expect(file.cards.map((c) => c.id)).toEqual(['k-van', 'k-tin']);
    expect(file.placements.map((p) => p.id)).toEqual(['p3']);
    expect(fileProblem(file)).toBeNull();
  });

  it('deletes a subject no card uses with nothing else changed', () => {
    const start = school();
    const file = deleteSubject(start, 'dia');
    expect(file.subjects.map((s) => s.id)).toEqual(['toan', 'van', 'tin']);
    expect(file.cards).toEqual(start.cards);
    expect(file.placements).toEqual(start.placements);
  });

  it('changes nothing for a subject that is gone', () => {
    const start = school();
    expect(deleteSubject(start, 'nowhere')).toBe(start);
  });
});

describe('subjectDeletionLines (DM-4, layout spec "Delete questions")', () => {
  const undone = "This can't be undone.";

  it('says how many cards, how many placements, and which classes', () => {
    expect(subjectDeletionLines(noLimits(), 'toan')).toEqual([
      '2 cards of Toán are on the grid 3 times, in 6A1 and 7B1. The cards and their places on the grid are deleted.',
      undone,
    ]);
  });

  it('says "that place" when several cards are on the grid once between them', () => {
    const start = noLimits();
    start.placements = [placed('p1', 'k-toan-lan', 'c1', 0, 'full')];
    expect(subjectDeletionLines(start, 'toan')[0]).toBe(
      '2 cards of Toán are on the grid once, in 6A1. The cards and that place on the grid are deleted.',
    );
  });

  it('says "its places" for one card placed more than once', () => {
    const start = noLimits();
    start.cards = start.cards.filter((c) => c.id !== 'k-toan-lan');
    start.placements = start.placements.filter((p) => p.cardId !== 'k-toan-lan');
    expect(subjectDeletionLines(start, 'toan')[0]).toBe(
      '1 card of Toán is on the grid 2 times, in 6A1 and 7B1. The card and its places on the grid are deleted.',
    );
  });

  it('says "once" for one card placed once', () => {
    expect(subjectDeletionLines(school(), 'van')).toEqual([
      '1 card of Ngữ văn is on the grid once, in 6A1. The card and its place on the grid are deleted.',
      undone,
    ]);
  });

  it('says when none of the cards is on the grid', () => {
    expect(subjectDeletionLines(school(), 'tin')).toEqual([
      "There's 1 card of Tin học, and it isn't on the grid. The card is deleted.",
      undone,
    ]);
    const start = noLimits();
    start.placements = [];
    expect(subjectDeletionLines(start, 'toan')[0]).toBe(
      'There are 2 cards of Toán, and none is on the grid. The cards are deleted.',
    );
  });

  it('says only that nothing uses a subject with no cards', () => {
    expect(subjectDeletionLines(school(), 'dia')).toEqual(['Nothing uses Địa lý.', undone]);
  });

  it('names the teachers whose subject limits go too (SYSTEM_DESIGN §10.5)', () => {
    expect(subjectDeletionLines(school(), 'toan')).toEqual([
      '2 cards of Toán are on the grid 3 times, in 6A1 and 7B1. The cards and their places on the grid are deleted.',
      "Thầy Phúc's subject limit on Toán goes too.",
      undone,
    ]);
    const start = school();
    start.teachers[0]!.conditions.push(limit('l2', 'toan', false));
    expect(subjectDeletionLines(start, 'toan')[1]).toBe(
      "Thầy Phúc's subject limits on Toán go too.",
    );
    start.teachers[1]!.conditions.push(limit('l3', 'toan'));
    start.teachers.push({ id: 'hoa', shortName: 'Cô Hoa', conditions: [limit('l4', 'toan')] });
    expect(subjectDeletionLines(start, 'toan')[1]).toBe(
      "Thầy Phúc's, Cô Lan's, and Cô Hoa's subject limits on Toán go too.",
    );
  });

  it('says no cards use a subject that only a limit names', () => {
    const start = school();
    start.teachers[1]!.conditions.push(limit('l3', 'dia'));
    expect(subjectDeletionLines(start, 'dia')).toEqual([
      'No cards use Địa lý.',
      "Cô Lan's subject limit on Địa lý goes too.",
      undone,
    ]);
  });

  it('says nothing for a subject that is gone', () => {
    expect(subjectDeletionLines(school(), 'nowhere')).toEqual([]);
  });
});
