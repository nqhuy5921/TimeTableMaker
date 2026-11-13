import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import {
  createAppState,
  selectClass,
  selectedClass,
  type AppState,
} from '../../src/domain/appState';
import {
  addClass,
  classDeletionLines,
  classesByGrade,
  classRows,
  deleteClass,
  editClass,
  placedPeriods,
  placedPeriodsByClass,
  type ClassFields,
} from '../../src/domain/classes';
import type { Placement, TimetableFile } from '../../src/domain/model';

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function withClasses(...names: string[]): AppState {
  const newId = ids();
  return names.reduce((state, name) => {
    const result = addClass(state, name, newId);
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }, createAppState(emptySchool()));
}

describe('addClass (TB-1, DM-2)', () => {
  it('adds a class with grade, track, and section read from its name, and selects it', () => {
    const result = addClass(createAppState(emptySchool()), ' 8CE2 ', () => 'c1');
    expect(result).toMatchObject({ ok: true, classId: 'c1' });
    if (!result.ok) return;
    expect(result.state.file.classes).toEqual([
      { id: 'c1', name: '8CE2', grade: 8, track: 'CE', section: 2 },
    ]);
    expect(result.state.selectedClassId).toBe('c1');
  });

  it('leaves the state it was given unchanged', () => {
    const before = createAppState(emptySchool());
    addClass(before, '6A1');
    expect(before.file.classes).toEqual([]);
    expect(before.selectedClassId).toBeNull();
  });

  it('gives each class its own id', () => {
    const { file } = withClasses('6A1', '7B2');
    const [a, b] = file.classes;
    expect(a?.id).not.toBe(b?.id);
  });

  it.each([
    ['', 'Enter a class name.'],
    ['   ', 'Enter a class name.'],
    ['6a1', 'Write the track in capital letters: 6A1.'],
    ['8ce2', 'Write the track in capital letters: 8CE2.'],
    ['5A1', "There's no Grade 5 yet. Add it with Grades on the Classes page."],
    ['10A1', "There's no Grade 10 yet. Add it with Grades on the Classes page."],
    ['13A1', /Use a grade, a track/],
    ['6C1', /track \(A, AA, CE, B, or BA\)/],
    ['6A', /section number/],
  ])('rejects %j', (name, error) => {
    const state = createAppState(emptySchool());
    const result = addClass(state, name);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(error);
  });

  it('rejects a name that is already taken', () => {
    const state = withClasses('6A1');
    expect(addClass(state, '6A1 ')).toEqual({
      ok: false,
      field: 'name',
      error: "There's already a class called 6A1.",
    });
  });

  it('accepts a good name', () => {
    expect(addClass(createAppState(emptySchool()), '9BA1').ok).toBe(true);
  });
});

describe('selectClass (TB-1)', () => {
  it('starts with no class selected', () => {
    expect(selectedClass(createAppState(emptySchool()))).toBeNull();
  });

  it('switches between classes without changing the timetable', () => {
    const state = withClasses('6A1', '7B2');
    const [a, b] = state.file.classes;
    if (!a || !b) throw new Error('missing classes');
    expect(selectedClass(state)?.name).toBe('7B2');

    const switched = selectClass(state, a.id);
    expect(selectedClass(switched)?.name).toBe('6A1');
    expect(switched.file).toBe(state.file);

    expect(selectedClass(selectClass(switched, b.id))?.name).toBe('7B2');
  });

  it('ignores an id that is not a class', () => {
    const state = withClasses('6A1');
    expect(selectClass(state, 'nope')).toBe(state);
  });
});

describe('placedPeriods (TB-4)', () => {
  it('counts by placement class: 2 for a full block, 1 for a half, a shared card in each', () => {
    const file: TimetableFile = {
      ...withClasses('6A1', '7B2').file,
      placements: [
        { id: 'p1', cardId: 'math', classId: 'id-1', day: 0, block: 0, part: 'full' },
        { id: 'p2', cardId: 'math', classId: 'id-1', day: 1, block: 0, part: 'full' },
        { id: 'p3', cardId: 'hr', classId: 'id-1', day: 2, block: 1, part: 'first' },
        // The same card as p1, on another class's grid.
        { id: 'p4', cardId: 'math', classId: 'id-2', day: 0, block: 0, part: 'full' },
      ],
    };
    expect(placedPeriods(file, 'id-1')).toBe(5);
    expect(placedPeriods(file, 'id-2')).toBe(2);
    expect(placedPeriodsByClass(file)).toEqual(
      new Map([
        ['id-1', 5],
        ['id-2', 2],
      ]),
    );
  });

  it('is 0 for a new class', () => {
    expect(placedPeriods(withClasses('6A1').file, 'id-1')).toBe(0);
  });
});

describe('classesByGrade', () => {
  it('groups by grade, in track order and then by section number', () => {
    const { file } = withClasses('7B2', '6BA1', '6A10', '6AA1', '6A2', '9CE1', '6CE1', '6B1');
    expect(
      classesByGrade(file.classes).map((group) => [group.grade, group.classes.map((c) => c.name)]),
    ).toEqual([
      [6, ['6A2', '6A10', '6AA1', '6CE1', '6B1', '6BA1']],
      [7, ['7B2']],
      [9, ['9CE1']],
    ]);
  });
});

// Two teachers, classes 6A1 (id-1) and 7B2 (id-2), and placements: 6A1 has a full block
// and a half (3 periods), 7B2 one full block.
function school(): AppState {
  const state = withClasses('6A1', '7B2');
  const place = (id: string, classId: string, part: Placement['part']): Placement => ({
    id,
    cardId: 'math',
    classId,
    day: 0,
    block: id === 'p2' ? 1 : 0,
    part,
  });
  return {
    ...state,
    file: {
      ...state.file,
      teachers: [
        { id: 'ngan', shortName: 'Cô Ngân', fullName: 'Nguyễn Thị Ngân', conditions: [] },
        { id: 'phuc', shortName: 'Thầy Phúc', conditions: [] },
      ],
      subjects: [{ id: 'toan', name: 'Toán', colorKey: 'math' }],
      cards: [{ id: 'math', subjectId: 'toan', teacherId: 'phuc', roomId: null }],
      placements: [
        place('p1', 'id-1', 'full'),
        place('p2', 'id-1', 'first'),
        place('p3', 'id-2', 'full'),
      ],
    },
  };
}

const fields = (over: Partial<ClassFields> = {}): ClassFields => ({
  name: '6A1',
  formTeacherId: 'ngan',
  coTeacherId: null,
  ...over,
});

describe('addClass from the class form (DM-2)', () => {
  it('adds the class with its homeroom teacher and assistant', () => {
    const result = addClass(school(), fields({ name: '8CE1', coTeacherId: 'phuc' }), () => 'c9');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.file.classes.at(-1)).toEqual({
      id: 'c9',
      name: '8CE1',
      grade: 8,
      track: 'CE',
      section: 1,
      formTeacherId: 'ngan',
      coTeacherId: 'phuc',
    });
    expect(result.state.selectedClassId).toBe('c9');
  });

  it('leaves the assistant out when there is none', () => {
    const result = addClass(school(), fields({ name: '8CE1' }), () => 'c9');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.file.classes.at(-1)).not.toHaveProperty('coTeacherId');
  });

  it('requires a homeroom teacher', () => {
    expect(addClass(school(), fields({ name: '8CE1', formTeacherId: null }))).toEqual({
      ok: false,
      field: 'formTeacher',
      error: 'Choose a homeroom teacher.',
    });
  });

  it('checks the name first, with the class-name rule', () => {
    expect(addClass(school(), fields({ name: '7B2', formTeacherId: null }))).toMatchObject({
      ok: false,
      field: 'name',
    });
  });
});

describe('editClass (DM-2)', () => {
  it('renames a class into another grade, keeping its id and grid', () => {
    const before = school().file;
    const result = editClass(before, 'id-1', fields({ name: '9BA3', coTeacherId: 'phuc' }));
    if (!result.ok) throw new Error(result.error);
    expect(result.file.classes[0]).toEqual({
      id: 'id-1',
      name: '9BA3',
      grade: 9,
      track: 'BA',
      section: 3,
      formTeacherId: 'ngan',
      coTeacherId: 'phuc',
    });
    expect(result.file.placements).toBe(before.placements);
    expect(classesByGrade(result.file.classes).map((g) => g.grade)).toEqual([7, 9]);
  });

  it('lets a class keep its own name, but not take another', () => {
    const file = school().file;
    expect(editClass(file, 'id-1', fields({ name: '6A1 ', formTeacherId: 'phuc' })).ok).toBe(true);
    expect(editClass(file, 'id-1', fields({ name: '7B2' }))).toEqual({
      ok: false,
      field: 'name',
      error: "There's already a class called 7B2.",
    });
  });

  it('returns the same file when nothing changes, so nothing is saved', () => {
    const once = editClass(school().file, 'id-1', fields({ coTeacherId: 'phuc' }));
    if (!once.ok) throw new Error(once.error);
    const { file } = once;
    expect(editClass(file, 'id-1', fields({ name: ' 6A1', coTeacherId: 'phuc' }))).toEqual({
      ok: true,
      classId: 'id-1',
      file,
    });
    // A changed assistant is a change.
    const result = editClass(file, 'id-1', fields());
    expect(result.ok && result.file).not.toBe(file);
  });

  it('drops the assistant when it is set to none', () => {
    const file = school().file;
    const once = editClass(file, 'id-1', fields({ coTeacherId: 'phuc' }));
    if (!once.ok) throw new Error(once.error);
    const twice = editClass(once.file, 'id-1', fields());
    if (!twice.ok) throw new Error(twice.error);
    expect(twice.file.classes[0]).not.toHaveProperty('coTeacherId');
  });

  it.each([
    [{ formTeacherId: null }, 'formTeacher', 'Choose a homeroom teacher.'],
    [{ formTeacherId: 'gone' }, 'formTeacher', "That teacher isn't in the list any more."],
    [{ coTeacherId: 'gone' }, 'coTeacher', "That teacher isn't in the list any more."],
    [{ coTeacherId: 'ngan' }, 'coTeacher', 'Pick a teacher other than the homeroom teacher.'],
  ] as const)('refuses %j', (over, field, error) => {
    expect(editClass(school().file, 'id-1', fields(over))).toEqual({ ok: false, field, error });
  });

  it('refuses a class that is gone', () => {
    expect(editClass(school().file, 'nope', fields())).toMatchObject({ ok: false, field: 'name' });
  });
});

describe('deleteClass (DM-2)', () => {
  it('removes the class and its placements, keeping the cards', () => {
    const state = selectClass(school(), 'id-2');
    const next = deleteClass(state, 'id-1');
    expect(next.file.classes.map((c) => c.name)).toEqual(['7B2']);
    expect(next.file.placements.map((p) => p.id)).toEqual(['p3']);
    expect(next.file.cards).toBe(state.file.cards);
    expect(next.selectedClassId).toBe('id-2');
  });

  it('puts the first class by grade on screen when the deleted one was there', () => {
    const state = withClasses('9B1', '7B2', '8A1');
    const next = deleteClass(state, 'id-3');
    expect(selectedClass(next)?.name).toBe('7B2');
    expect(deleteClass(withClasses('6A1'), 'id-1').selectedClassId).toBeNull();
  });

  it('ignores a class that is gone', () => {
    const state = school();
    expect(deleteClass(state, 'nope')).toBe(state);
  });
});

describe('classDeletionLines (DM-2, layout spec "Delete questions")', () => {
  const undone = "This can't be undone.";

  it('says how many periods are placed and that the cards stay', () => {
    expect(classDeletionLines(school().file, 'id-1')).toEqual([
      "3 periods are placed in 6A1. They'll be taken off its grid; the cards stay in the pool.",
      undone,
    ]);
  });

  it('says "1 period is" and "It\'ll" for one half block', () => {
    const { file } = school();
    const half = { ...file, placements: file.placements.filter((p) => p.part !== 'full') };
    expect(classDeletionLines(half, 'id-1')[0]).toBe(
      "1 period is placed in 6A1. It'll be taken off its grid; the cards stay in the pool.",
    );
  });

  it('says only that nothing is placed in an empty class', () => {
    const { file } = school();
    expect(classDeletionLines({ ...file, placements: [] }, 'id-1')).toEqual([
      'Nothing is placed in 6A1.',
      undone,
    ]);
  });

  it('says nothing for a class that is gone', () => {
    expect(classDeletionLines(school().file, 'nope')).toEqual([]);
  });
});

describe('classRows (DM-2)', () => {
  it('lists classes in class-bar order with their teachers and periods placed', () => {
    const state = school();
    const result = editClass(state.file, 'id-2', fields({ name: '7B2', coTeacherId: 'phuc' }));
    if (!result.ok) throw new Error(result.error);
    const added = addClass({ ...state, file: result.file }, '6A2', () => 'id-3');
    if (!added.ok) throw new Error(added.error);
    expect(
      classRows(added.state.file, '').map((r) => [
        r.schoolClass.name,
        r.homeroom?.shortName,
        r.assistant?.shortName,
        r.placed,
      ]),
    ).toEqual([
      ['6A1', undefined, undefined, 3],
      ['6A2', undefined, undefined, 0],
      ['7B2', 'Cô Ngân', 'Thầy Phúc', 2],
    ]);
  });

  it.each([
    ['7b2', ['7B2']],
    ['ngan', ['7B2']],
    ['nguyen thi', ['7B2']],
    ['phuc', ['7B2']],
    ['6a', ['6A1']],
    ['  ', ['6A1', '7B2']],
    ['zzz', []],
  ])('searches %j by class name or either teacher, ignoring case and accents', (query, names) => {
    const state = school();
    const result = editClass(state.file, 'id-2', fields({ name: '7B2', coTeacherId: 'phuc' }));
    if (!result.ok) throw new Error(result.error);
    expect(classRows(result.file, query).map((r) => r.schoolClass.name)).toEqual(names);
  });
});
