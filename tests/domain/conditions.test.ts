import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import {
  addCondition,
  blocksWhen,
  changeConditionType,
  CONDITION_LABELS,
  conditionFieldProblems,
  conditionSentence,
  type ConditionResult,
  type ConditionValues,
  defaultConditionValues,
  deleteCondition,
  editCondition,
  setConditionOn,
} from '../../src/domain/conditions';
import { fileProblem } from '../../src/domain/integrity';
import { CONDITION_TYPES, type TimetableFile } from '../../src/domain/model';

// Teacher conditions (TC-1, SYSTEM_DESIGN §9.1 and §9.4). Made-up names only.

function school(): TimetableFile {
  return {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'tin', name: 'Tin học', colorKey: 'informatics' },
    ],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', conditions: [] },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    // Thầy Phúc teaches Toán and Tin học; Cô Lan has no cards.
    cards: [
      { id: 'k-toan', subjectId: 'toan', teacherId: 'phuc', roomId: null },
      { id: 'k-tin', subjectId: 'tin', teacherId: 'phuc', roomId: null },
    ],
  };
}

function ok(result: ConditionResult): TimetableFile {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

const ids = () => {
  let n = 0;
  return () => `c${++n}`;
};

const conditionsOf = (file: TimetableFile, teacherId = 'phuc') =>
  file.teachers.find((t) => t.id === teacherId)!.conditions;

describe('conditionSentence', () => {
  const file = school();
  const sentence = (values: ConditionValues) => conditionSentence(file, values);

  it('says a subject limit with its subject, number, and day or week', () => {
    expect(sentence({ type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' })).toBe(
      'At most 3 periods of Toán a week',
    );
    expect(sentence({ type: 'subjectLimit', subjectId: 'tin', max: 1, per: 'day' })).toBe(
      'At most 1 period of Tin học a day',
    );
  });

  it('says unavailable times as morning, afternoon, or the chosen periods, on the days', () => {
    expect(sentence({ type: 'unavailable', blocks: [3, 4], days: [0, 1, 2, 3, 4] })).toBe(
      "Can't teach in the afternoon on any day",
    );
    expect(sentence({ type: 'unavailable', blocks: [0, 1, 2], days: [4] })).toBe(
      "Can't teach in the morning on Friday",
    );
    expect(sentence({ type: 'unavailable', blocks: [0], days: [0] })).toBe(
      "Can't teach in periods 1–2 on Monday",
    );
    expect(sentence({ type: 'unavailable', blocks: [0, 3], days: [0, 2] })).toBe(
      "Can't teach in periods 1–2 or 7–8 on Monday or Wednesday",
    );
    expect(sentence({ type: 'unavailable', blocks: [0, 2, 4], days: [0, 1, 4] })).toBe(
      "Can't teach in periods 1–2, 5–6, or 9–10 on Monday, Tuesday, or Friday",
    );
    expect(sentence({ type: 'unavailable', blocks: [0, 1, 2, 3, 4], days: [1] })).toBe(
      "Can't teach at any time on Tuesday",
    );
  });

  it('says days off', () => {
    expect(sentence({ type: 'daysOff', days: [2] })).toBe('Not on Wednesday');
    expect(sentence({ type: 'daysOff', days: [2, 4] })).toBe('Not on Wednesday or Friday');
    expect(sentence({ type: 'daysOff', days: [0, 2, 4] })).toBe(
      'Not on Monday, Wednesday, or Friday',
    );
  });

  it('says the five counted types', () => {
    expect(sentence({ type: 'maxPeriodsPerDay', max: 6 })).toBe('At most 6 periods on any day');
    expect(sentence({ type: 'maxPeriodsPerWeek', max: 18 })).toBe('At most 18 periods a week');
    expect(sentence({ type: 'maxBlocksInRow', max: 2 })).toBe('At most 2 blocks in a row');
    expect(sentence({ type: 'maxBlocksInRow', max: 1 })).toBe('At most 1 block in a row');
    expect(sentence({ type: 'maxGapsPerDay', max: 1 })).toBe(
      'At most 1 free block between lessons in a day',
    );
    expect(sentence({ type: 'maxGapsPerDay', max: 2 })).toBe(
      'At most 2 free blocks between lessons in a day',
    );
    expect(sentence({ type: 'maxGapsPerDay', max: 0 })).toBe(
      'No free block between lessons in a day',
    );
    expect(sentence({ type: 'maxTeachingDays', max: 4 })).toBe('Teaches on at most 4 days a week');
    expect(sentence({ type: 'maxTeachingDays', max: 1 })).toBe('Teaches on at most 1 day a week');
  });
});

describe('blocksWhen', () => {
  it('names the morning and the afternoon, and anything else is chosen blocks', () => {
    expect(blocksWhen([0, 1, 2])).toBe('morning');
    expect(blocksWhen([3, 4])).toBe('afternoon');
    expect(blocksWhen([0, 1])).toBe('chosen');
    expect(blocksWhen([0, 1, 2, 3, 4])).toBe('chosen');
  });
});

describe('the allowed values', () => {
  const file = school();
  const problems = (values: ConditionValues) => conditionFieldProblems(file, values);
  const numberMessage = (values: ConditionValues) =>
    problems(values).find((p) => p.field === 'max')?.error;

  it.each([
    ['maxPeriodsPerDay', 1, 10],
    ['maxPeriodsPerWeek', 1, 50],
    ['maxBlocksInRow', 1, 3],
    ['maxGapsPerDay', 0, 3],
    ['maxTeachingDays', 1, 4],
  ] as const)('%s takes a whole number from %i to %i', (type, min, max) => {
    expect(problems({ type, max: min })).toEqual([]);
    expect(problems({ type, max })).toEqual([]);
    const message = `Enter a whole number from ${min} to ${max}.`;
    expect(numberMessage({ type, max: min - 1 })).toBe(message);
    expect(numberMessage({ type, max: max + 1 })).toBe(message);
    expect(numberMessage({ type, max: min + 0.5 })).toBe(message);
    expect(numberMessage({ type, max: NaN })).toBe(message);
  });

  it('takes a subject limit of 1 to 10 a day or 1 to 50 a week, for a subject in the file', () => {
    const limit = (max: number, per: 'day' | 'week', subjectId = 'toan') =>
      ({ type: 'subjectLimit', subjectId, max, per }) as const;
    expect(problems(limit(10, 'day'))).toEqual([]);
    expect(numberMessage(limit(11, 'day'))).toBe('Enter a whole number from 1 to 10.');
    expect(problems(limit(50, 'week'))).toEqual([]);
    expect(numberMessage(limit(51, 'week'))).toBe('Enter a whole number from 1 to 50.');
    expect(numberMessage(limit(0, 'week'))).toBe('Enter a whole number from 1 to 50.');
    expect(problems(limit(3, 'day', ''))).toEqual([{ field: 'subject', error: 'Pick a subject.' }]);
    expect(problems(limit(3, 'day', 'gone'))).toEqual([
      { field: 'subject', error: 'Pick a subject.' },
    ]);
  });

  it('needs at least one day, and for unavailable times at least one block', () => {
    expect(problems({ type: 'daysOff', days: [] })).toEqual([
      { field: 'days', error: 'Pick at least one day.' },
    ]);
    expect(problems({ type: 'unavailable', blocks: [], days: [] })).toEqual([
      { field: 'blocks', error: 'Pick at least one block.' },
      { field: 'days', error: 'Pick at least one day.' },
    ]);
  });
});

describe('the form defaults', () => {
  it('starts every type with allowed values, except the picks the user has to make', () => {
    const file = school();
    for (const type of CONDITION_TYPES) {
      const fields = conditionFieldProblems(file, defaultConditionValues(type)).map((p) => p.field);
      expect(fields).toEqual(
        type === 'subjectLimit' ? ['subject'] : type === 'daysOff' ? ['days'] : [],
      );
      expect(CONDITION_LABELS[type]).not.toBe('');
    }
    expect(defaultConditionValues('maxPeriodsPerDay')).toEqual({
      type: 'maxPeriodsPerDay',
      max: 6,
    });
    expect(defaultConditionValues('maxPeriodsPerWeek')).toEqual({
      type: 'maxPeriodsPerWeek',
      max: 18,
    });
    expect(defaultConditionValues('unavailable')).toEqual({
      type: 'unavailable',
      blocks: [0, 1, 2],
      days: [0, 1, 2, 3, 4],
    });
  });

  it('keeps the number when the type changes and both types have one', () => {
    expect(changeConditionType({ type: 'maxPeriodsPerDay', max: 5 }, 'maxPeriodsPerWeek')).toEqual({
      type: 'maxPeriodsPerWeek',
      max: 5,
    });
    expect(changeConditionType({ type: 'maxPeriodsPerDay', max: 5 }, 'subjectLimit')).toEqual({
      type: 'subjectLimit',
      subjectId: '',
      max: 5,
      per: 'day',
    });
    expect(changeConditionType({ type: 'maxPeriodsPerDay', max: 5 }, 'daysOff')).toEqual({
      type: 'daysOff',
      days: [],
    });
    expect(changeConditionType({ type: 'daysOff', days: [2] }, 'unavailable')).toEqual(
      defaultConditionValues('unavailable'),
    );
  });
});

describe('addCondition, editCondition, setConditionOn, deleteCondition', () => {
  it('adds a condition switched on, after the teacher’s others, and the file still holds together', () => {
    const newId = ids();
    let file = ok(addCondition(school(), 'phuc', { type: 'maxPeriodsPerDay', max: 6 }, newId));
    file = ok(
      addCondition(
        file,
        'phuc',
        { type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' },
        newId,
      ),
    );
    expect(conditionsOf(file)).toEqual([
      { id: 'c1', on: true, type: 'maxPeriodsPerDay', max: 6 },
      { id: 'c2', on: true, type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' },
    ]);
    expect(conditionsOf(file, 'lan')).toEqual([]);
    expect(fileProblem(file)).toBeNull();
  });

  it('takes several conditions of one type', () => {
    const newId = ids();
    let file = school();
    file = ok(
      addCondition(
        file,
        'phuc',
        { type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' },
        newId,
      ),
    );
    file = ok(
      addCondition(
        file,
        'phuc',
        { type: 'subjectLimit', subjectId: 'tin', max: 2, per: 'day' },
        newId,
      ),
    );
    file = ok(addCondition(file, 'phuc', { type: 'daysOff', days: [2] }, newId));
    file = ok(addCondition(file, 'phuc', { type: 'daysOff', days: [4] }, newId));
    expect(conditionsOf(file).map((c) => conditionSentence(file, c))).toEqual([
      'At most 3 periods of Toán a week',
      'At most 2 periods of Tin học a day',
      'Not on Wednesday',
      'Not on Friday',
    ]);
    expect(fileProblem(file)).toBeNull();
  });

  it('stores days and blocks once each, in order, and only the type’s own values', () => {
    const values = {
      type: 'unavailable',
      blocks: [4, 0, 4],
      days: [3, 1, 1],
      max: 9,
    } as unknown as ConditionValues;
    const file = ok(addCondition(school(), 'phuc', values, ids()));
    expect(conditionsOf(file)).toEqual([
      { id: 'c1', on: true, type: 'unavailable', blocks: [0, 4], days: [1, 3] },
    ]);
  });

  it('refuses values out of range with the field’s message, and changes nothing', () => {
    const file = school();
    expect(addCondition(file, 'phuc', { type: 'maxPeriodsPerDay', max: 11 })).toEqual({
      ok: false,
      field: 'max',
      error: 'Enter a whole number from 1 to 10.',
    });
    expect(addCondition(file, 'phuc', { type: 'daysOff', days: [] })).toEqual({
      ok: false,
      field: 'days',
      error: 'Pick at least one day.',
    });
    expect(addCondition(file, 'phuc', { type: 'unavailable', blocks: [], days: [0] })).toEqual({
      ok: false,
      field: 'blocks',
      error: 'Pick at least one block.',
    });
    expect(
      addCondition(file, 'phuc', { type: 'subjectLimit', subjectId: '', max: 3, per: 'day' }),
    ).toEqual({ ok: false, field: 'subject', error: 'Pick a subject.' });
    expect(addCondition(file, 'nobody', { type: 'maxTeachingDays', max: 4 })).toMatchObject({
      ok: false,
      field: null,
    });
    expect(conditionsOf(file)).toEqual([]);
  });

  it('edits a condition in place, its type too, keeping its id and switch', () => {
    const newId = ids();
    let file = ok(addCondition(school(), 'phuc', { type: 'maxPeriodsPerDay', max: 6 }, newId));
    file = ok(addCondition(file, 'phuc', { type: 'daysOff', days: [2] }, newId));
    file = setConditionOn(file, 'phuc', 'c1', false);
    file = ok(editCondition(file, 'phuc', 'c1', { type: 'maxPeriodsPerWeek', max: 18 }));
    expect(conditionsOf(file)).toEqual([
      { id: 'c1', on: false, type: 'maxPeriodsPerWeek', max: 18 },
      { id: 'c2', on: true, type: 'daysOff', days: [2] },
    ]);
    expect(editCondition(file, 'phuc', 'c2', { type: 'daysOff', days: [] })).toMatchObject({
      ok: false,
      field: 'days',
    });
    expect(editCondition(file, 'phuc', 'gone', { type: 'daysOff', days: [1] })).toMatchObject({
      ok: false,
    });
  });

  it('switches a condition off and on without losing it', () => {
    let file = ok(addCondition(school(), 'phuc', { type: 'maxBlocksInRow', max: 2 }, ids()));
    file = setConditionOn(file, 'phuc', 'c1', false);
    expect(conditionsOf(file)).toEqual([{ id: 'c1', on: false, type: 'maxBlocksInRow', max: 2 }]);
    file = setConditionOn(file, 'phuc', 'c1', true);
    expect(conditionsOf(file)).toEqual([{ id: 'c1', on: true, type: 'maxBlocksInRow', max: 2 }]);
  });

  it('gives back the same file when nothing changes, so nothing is saved', () => {
    const file = ok(addCondition(school(), 'phuc', { type: 'maxBlocksInRow', max: 2 }, ids()));
    expect(setConditionOn(file, 'phuc', 'c1', true)).toBe(file);
    expect(setConditionOn(file, 'phuc', 'gone', false)).toBe(file);
    expect(setConditionOn(file, 'nobody', 'c1', false)).toBe(file);
    expect(deleteCondition(file, 'phuc', 'gone')).toBe(file);
    expect(deleteCondition(file, 'nobody', 'c1')).toBe(file);
  });

  it('deletes only the condition named', () => {
    const newId = ids();
    let file = ok(addCondition(school(), 'phuc', { type: 'maxGapsPerDay', max: 1 }, newId));
    file = ok(addCondition(file, 'phuc', { type: 'maxTeachingDays', max: 4 }, newId));
    file = deleteCondition(file, 'phuc', 'c1');
    expect(conditionsOf(file)).toEqual([{ id: 'c2', on: true, type: 'maxTeachingDays', max: 4 }]);
  });
});

describe("a subject limit's subject is one the teacher teaches (2026-10-23)", () => {
  const limit = (subjectId: string) =>
    ({ type: 'subjectLimit', subjectId, max: 2, per: 'day' }) as const;

  it('refuses a subject the teacher has no card of', () => {
    expect(addCondition(school(), 'lan', limit('toan'), ids())).toEqual({
      ok: false,
      field: 'subject',
      error: 'Pick a subject Cô Lan teaches.',
    });
    expect(addCondition(school(), 'phuc', limit('toan'), ids()).ok).toBe(true);
  });

  it('lets an edit keep the subject it had, but not move to another untaught one', () => {
    // Cô Lan's limit on Toán, from before she lost her card.
    const start = school();
    start.teachers[1]!.conditions = [{ id: 'c1', on: true, ...limit('toan') }];
    expect(editCondition(start, 'lan', 'c1', { ...limit('toan'), max: 3 }).ok).toBe(true);
    expect(editCondition(start, 'lan', 'c1', limit('tin'))).toMatchObject({
      ok: false,
      field: 'subject',
    });
  });
});
