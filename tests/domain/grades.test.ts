import { describe, expect, it } from 'vitest';
import {
  addGrade,
  checkGrade,
  deleteGrade,
  editGrade,
  gradeDeletionLines,
  gradeLabel,
  gradeRenameLine,
  gradeRows,
  gradesOf,
} from '../../src/domain/grades';
import { fileProblem } from '../../src/domain/integrity';
import type { Placement, SchoolClass, TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

// The grade list (DM-8, SYSTEM_DESIGN §13.3). Made-up names only.

function schoolClass(id: string, name: string): SchoolClass {
  const [, grade, track, section] = /^(\d+)([A-Z]+)(\d+)$/.exec(name)!;
  return {
    id,
    name,
    grade: Number(grade),
    track: track as SchoolClass['track'],
    section: Number(section),
  };
}

function placed(id: string, classId: string, block: Placement['block'], part: Placement['part']) {
  return { id, cardId: 'k1', classId, day: 0, block, part } satisfies Placement;
}

/** Grades 6, 7, and 9: 6A1 (2 full blocks and a half), 6AA1 and 6A2 (nothing placed), and
    9B1 (one full block). Grade 7 has no classes. */
const school: TimetableFile = {
  ...createEmptyTimetable(),
  grades: [6, 7, 9],
  subjects: [{ id: 's1', name: 'Toán', colorKey: 'math' }],
  teachers: [{ id: 't1', shortName: 'Phúc', conditions: [] }],
  classes: [
    { ...schoolClass('c-6aa1', '6AA1'), formTeacherId: 't1' },
    schoolClass('c-9b1', '9B1'),
    schoolClass('c-6a2', '6A2'),
    schoolClass('c-6a1', '6A1'),
  ],
  cards: [{ id: 'k1', subjectId: 's1', teacherId: 't1', roomId: null }],
  placements: [
    placed('p1', 'c-6a1', 0, 'full'),
    placed('p2', 'c-6a1', 1, 'full'),
    placed('p3', 'c-6a1', 2, 'first'),
    placed('p4', 'c-9b1', 0, 'full'),
  ],
};

const ok = <T extends { ok: boolean }>(result: T) => {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
};

describe('gradeLabel', () => {
  it('names a grade as on screen', () => {
    expect(gradeLabel(10)).toBe('Grade 10');
  });
});

describe('checkGrade', () => {
  it.each(['1', '12', ' 10 ', '08'])('takes %j', (input) => {
    expect(checkGrade(school, input, null).ok).toBe(true);
  });

  it.each(['', ' ', '0', '13', '6.5', '-1', 'six', '1e1', '100'])('refuses %j', (input) => {
    expect(checkGrade(school, input, null)).toEqual({
      ok: false,
      error: 'Enter a grade from 1 to 12.',
    });
  });

  it('refuses a grade the list has, unless it is the one being edited', () => {
    expect(checkGrade(school, '7', null)).toEqual({
      ok: false,
      error: "There's already a Grade 7.",
    });
    expect(checkGrade(school, '7', 7)).toEqual({ ok: true, grade: 7 });
    expect(checkGrade(school, '9', 7)).toEqual({ ok: false, error: "There's already a Grade 9." });
  });
});

describe('addGrade', () => {
  it('adds a grade in number order', () => {
    expect(ok(addGrade(school, '8')).file.grades).toEqual([6, 7, 8, 9]);
    expect(ok(addGrade(school, '12')).file.grades).toEqual([6, 7, 9, 12]);
    expect(ok(addGrade(createEmptyTimetable(), ' 1 '))).toMatchObject({
      grade: 1,
      file: { grades: [1] },
    });
  });

  it('refuses a bad or repeated grade, leaving the file as it was', () => {
    expect(addGrade(school, '6')).toEqual({ ok: false, error: "There's already a Grade 6." });
    expect(addGrade(school, '0').ok).toBe(false);
    expect(school.grades).toEqual([6, 7, 9]);
  });
});

describe('editGrade', () => {
  it('renames its classes to match, keeping their ids, teachers, and placements', () => {
    const { file, grade } = ok(editGrade(school, 6, '10'));
    expect(grade).toBe(10);
    expect(file.grades).toEqual([7, 9, 10]);
    expect(file.classes).toEqual([
      { ...schoolClass('c-6aa1', '10AA1'), formTeacherId: 't1' },
      schoolClass('c-9b1', '9B1'),
      schoolClass('c-6a2', '10A2'),
      schoolClass('c-6a1', '10A1'),
    ]);
    expect(file.placements).toBe(school.placements);
    expect(fileProblem(file)).toBeNull();
  });

  it('moves a grade with no classes to another number', () => {
    const { file } = ok(editGrade(school, 7, '1'));
    expect(file.grades).toEqual([1, 6, 9]);
    expect(file.classes).toEqual(school.classes);
  });

  it('gives back the same file when the number is unchanged', () => {
    expect(ok(editGrade(school, 6, ' 6 ')).file).toBe(school);
  });

  it("refuses a number another grade has, a bad number, or a grade that's gone", () => {
    expect(editGrade(school, 6, '9')).toEqual({ ok: false, error: "There's already a Grade 9." });
    expect(editGrade(school, 6, '13').ok).toBe(false);
    expect(editGrade(school, 8, '10')).toEqual({
      ok: false,
      error: "That grade isn't in the list any more.",
    });
  });
});

describe('gradeRows', () => {
  it('lists every grade in order with its class count', () => {
    expect(gradeRows(school)).toEqual([
      { grade: 6, classes: 3 },
      { grade: 7, classes: 0 },
      { grade: 9, classes: 1 },
    ]);
  });
});

describe('gradeRenameLine', () => {
  it('says how the classes are renamed, with the first in class-bar order', () => {
    expect(gradeRenameLine(school, 6, '10')).toBe(
      'Its 3 classes are renamed to match, so 6A1 becomes 10A1.',
    );
    expect(gradeRenameLine(school, 9, '11')).toBe(
      'Its class is renamed to match, so 9B1 becomes 11B1.',
    );
  });

  it('names no example until a new number that can be used is typed', () => {
    for (const input of ['', '6', '13', '9']) {
      expect(gradeRenameLine(school, 6, input)).toBe('Its 3 classes are renamed to match.');
    }
  });

  it('says nothing for a grade with no classes', () => {
    expect(gradeRenameLine(school, 7, '8')).toBeNull();
  });
});

describe('gradeDeletionLines', () => {
  it('names the classes that go and the periods taken off their grids', () => {
    expect(gradeDeletionLines(school, 6)).toEqual([
      'Its 3 classes go with it: 6A1, 6A2, 6AA1.',
      '5 periods placed on their grids are taken off; the cards stay in the pool.',
      "This can't be undone.",
    ]);
    expect(gradeDeletionLines(school, 9)).toEqual([
      'Its class 9B1 goes with it.',
      '2 periods placed on its grid are taken off; the cards stay in the pool.',
      "This can't be undone.",
    ]);
  });

  it('leaves out the periods when none is placed, and says when there are no classes', () => {
    const nothingPlaced = { ...school, placements: [] };
    expect(gradeDeletionLines(nothingPlaced, 6)).toEqual([
      'Its 3 classes go with it: 6A1, 6A2, 6AA1.',
      "This can't be undone.",
    ]);
    expect(gradeDeletionLines(school, 7)).toEqual([
      'Grade 7 has no classes.',
      "This can't be undone.",
    ]);
  });

  it('says one period for a single half block', () => {
    const half = { ...school, placements: [placed('p1', 'c-9b1', 0, 'second')] };
    expect(gradeDeletionLines(half, 9)[1]).toBe(
      '1 period placed on its grid is taken off; the cards stay in the pool.',
    );
  });
});

describe('deleteGrade', () => {
  it('deletes the grade, its classes, and their placements, keeping the cards', () => {
    const next = deleteGrade({ file: school, selectedClassId: 'c-9b1' }, 6);
    expect(next.file.grades).toEqual([7, 9]);
    expect(next.file.classes.map((c) => c.id)).toEqual(['c-9b1']);
    expect(next.file.placements.map((p) => p.id)).toEqual(['p4']);
    expect(next.file.cards).toBe(school.cards);
    expect(next.selectedClassId).toBe('c-9b1');
    expect(fileProblem(next.file)).toBeNull();
  });

  it('shows the first class by grade when the class on screen goes, or none', () => {
    expect(deleteGrade({ file: school, selectedClassId: 'c-6a2' }, 6).selectedClassId).toBe(
      'c-9b1',
    );
    const onlySix = {
      ...school,
      grades: [6],
      classes: school.classes.filter((c) => c.grade === 6),
    };
    expect(
      deleteGrade({ file: { ...onlySix, placements: [] }, selectedClassId: 'c-6a1' }, 6),
    ).toEqual({
      file: { ...onlySix, grades: [], classes: [], placements: [] },
      selectedClassId: null,
    });
  });

  it('deletes a grade with no classes, and leaves the state alone for one not listed', () => {
    const state = { file: school, selectedClassId: 'c-6a1' };
    expect(deleteGrade(state, 7)).toEqual({ ...state, file: { ...school, grades: [6, 9] } });
    expect(deleteGrade(state, 8)).toBe(state);
  });
});

describe('gradesOf', () => {
  it("gives the classes' grades in order, once each", () => {
    expect(gradesOf(school.classes)).toEqual([6, 9]);
    expect(gradesOf([])).toEqual([]);
  });
});
