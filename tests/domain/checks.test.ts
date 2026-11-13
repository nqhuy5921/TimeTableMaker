import { describe, expect, it } from 'vitest';
import { emptySchool } from '../../fixtures/emptySchool';
import { checkTimetable, type Issue, type IssueKind } from '../../src/domain/checks';
import type { ConditionValues } from '../../src/domain/conditions';
import type {
  BlockIndex,
  Card,
  Day,
  Placement,
  PlacementPart,
  TeacherCondition,
  TimetableFile,
} from '../../src/domain/model';

// The checks engine (TC-2, SYSTEM_DESIGN §9.2 and the checks row of §9.6). Made-up names only.

const card = (
  id: string,
  subjectId: string,
  teacherId: string | null,
  roomId: string | null,
): Card => ({
  id,
  subjectId,
  teacherId,
  roomId,
});

/** Thầy Phúc teaches Toán in P101 or P102, Cô Lan teaches Ngữ văn in P102 and Toán with no
    room, and one Toán card has no teacher and no room. */
function school(placements: Placement[] = [], conditions: TeacherCondition[] = []): TimetableFile {
  return {
    ...emptySchool(),
    classes: [
      { id: '7B1', name: '7B1', grade: 7, track: 'B', section: 1 },
      { id: '6A2', name: '6A2', grade: 6, track: 'A', section: 2 },
      { id: '6A1', name: '6A1', grade: 6, track: 'A', section: 1 },
    ],
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
    ],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', conditions },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    rooms: [
      { id: 'p101', name: 'P101' },
      { id: 'p102', name: 'P102' },
    ],
    cards: [
      card('phuc1', 'toan', 'phuc', 'p101'),
      card('phuc2', 'toan', 'phuc', 'p102'),
      card('lanVan', 'van', 'lan', 'p102'),
      card('lanToan', 'toan', 'lan', null),
      card('nobody', 'toan', null, null),
    ],
    placements,
  };
}

let n = 0;
/** A placement with a made-up id: `at('phuc1', '6A1', 0, 1)` is Monday 3–4. */
function at(
  cardId: string,
  classId: string,
  day: number,
  block: number,
  part: PlacementPart = 'full',
  id = `p${++n}`,
): Placement {
  return { id, cardId, classId, day: day as Day, block: block as BlockIndex, part };
}

const of = (issues: Issue[], ...kinds: IssueKind[]) => issues.filter((i) => kinds.includes(i.kind));
const check = (file: TimetableFile, ...kinds: IssueKind[]) => of(checkTimetable(file), ...kinds);

describe('teacher in two places', () => {
  it('is an error for a teacher in two classes in one block, full against full', () => {
    const a = at('phuc1', '6A1', 0, 1, 'full', 'a');
    const b = at('phuc2', '6A2', 0, 1, 'full', 'b');
    expect(check(school([b, a]), 'teacherTwice')).toEqual([
      {
        id: '["teacherTwice","phuc",0,1,"full"]',
        severity: 'error',
        kind: 'teacherTwice',
        teacherId: 'phuc',
        conditionId: null,
        message: 'Thầy Phúc is in 6A1 and 6A2 at the same time',
        where: '6A1, 6A2 · Monday · Periods 3–4',
        placementIds: ['a', 'b'],
        classIds: ['6A1', '6A2'],
      },
    ]);
  });

  it('is one issue per half when a full block clashes with a half', () => {
    const issues = check(
      school([at('phuc1', '6A1', 1, 2, 'full', 'a'), at('phuc2', '7B1', 1, 2, 'second', 'b')]),
      'teacherTwice',
    );
    expect(issues.map((i) => [i.id, i.where, i.placementIds])).toEqual([
      ['["teacherTwice","phuc",1,2,"second"]', '6A1, 7B1 · Tuesday · Period 6', ['a', 'b']],
    ]);
  });

  it('names both halves when a full block clashes with a different class in each half', () => {
    const issues = check(
      school([
        at('phuc1', '6A1', 0, 0, 'full', 'a'),
        at('phuc2', '6A2', 0, 0, 'first', 'b'),
        at('phuc2', '7B1', 0, 0, 'second', 'c'),
      ]),
      'teacherTwice',
    );
    expect(issues.map((i) => [i.id, i.message, i.where])).toEqual([
      [
        '["teacherTwice","phuc",0,0,"first"]',
        'Thầy Phúc is in 6A1 and 6A2 at the same time',
        '6A1, 6A2 · Monday · Period 1',
      ],
      [
        '["teacherTwice","phuc",0,0,"second"]',
        'Thầy Phúc is in 6A1 and 7B1 at the same time',
        '6A1, 7B1 · Monday · Period 2',
      ],
    ]);
  });

  it('lists three classes in class-bar order', () => {
    const issues = check(
      school([at('phuc1', '7B1', 0, 1), at('phuc1', '6A2', 0, 1), at('phuc1', '6A1', 0, 1)]),
      'teacherTwice',
    );
    expect(issues[0]!.message).toBe('Thầy Phúc is in 6A1, 6A2, and 7B1 at the same time');
    expect(issues[0]!.classIds).toEqual(['6A1', '6A2', '7B1']);
  });

  it("isn't a clash for two half cards sharing a block, in one class or across classes", () => {
    expect(
      checkTimetable(
        school([at('phuc1', '6A1', 0, 1, 'first'), at('phuc2', '6A1', 0, 1, 'second')]),
      ),
    ).toEqual([]);
    expect(
      checkTimetable(
        school([at('phuc1', '6A1', 0, 1, 'first'), at('phuc1', '7B1', 0, 1, 'second')]),
      ),
    ).toEqual([]);
  });

  it('is an error, with the room in use twice, for the same card on two grids at once', () => {
    const issues = checkTimetable(school([at('phuc1', '6A1', 2, 3), at('phuc1', '6A2', 2, 3)]));
    expect(issues.map((i) => i.message)).toEqual([
      'Thầy Phúc is in 6A1 and 6A2 at the same time',
      'Room P101 has 6A1 and 6A2 at the same time',
    ]);
  });

  it("doesn't count two different times or two different teachers", () => {
    expect(
      check(
        school([at('phuc1', '6A1', 0, 1), at('phuc2', '6A2', 0, 2), at('lanToan', '7B1', 0, 1)]),
        'teacherTwice',
      ),
    ).toEqual([]);
  });
});

describe('room in use twice', () => {
  it('is an error for one room with two classes in one block, whoever teaches', () => {
    const issues = check(
      school([at('phuc2', '6A2', 1, 3, 'full', 'a'), at('lanVan', '7B1', 1, 3, 'full', 'b')]),
      'roomTwice',
    );
    expect(issues).toEqual([
      {
        id: '["roomTwice","p102",1,3,"full"]',
        severity: 'error',
        kind: 'roomTwice',
        teacherId: null,
        conditionId: null,
        message: 'Room P102 has 6A2 and 7B1 at the same time',
        where: '6A2, 7B1 · Tuesday · Periods 7–8',
        placementIds: ['a', 'b'],
        classIds: ['6A2', '7B1'],
      },
    ]);
  });

  it("isn't a clash for two halves of a block", () => {
    expect(
      check(
        school([at('phuc2', '6A2', 1, 3, 'first'), at('lanVan', '7B1', 1, 3, 'second')]),
        'roomTwice',
      ),
    ).toEqual([]);
  });
});

describe('ids that contain the separator', () => {
  it('still name the right teacher, day, and block', () => {
    const base = school([at('odd', '6A1', 3, 4, 'full', 'a'), at('odd', '6A2', 3, 4, 'full', 'b')]);
    const file = {
      ...base,
      teachers: [...base.teachers, { id: 'x|1', shortName: 'Cô Mai', conditions: [] }],
      cards: [...base.cards, card('odd', 'van', 'x|1', null)],
    };
    expect(check(file, 'teacherTwice').map((i) => [i.message, i.where])).toEqual([
      ['Cô Mai is in 6A1 and 6A2 at the same time', '6A1, 6A2 · Thursday · Periods 9–10'],
    ]);
  });

  it('keep classes and subjects apart, and give each issue its own id', () => {
    // Class "a|b" with subject "c", and class "a" with subject "b|c", each twice on Monday.
    const base = school([]);
    const file: TimetableFile = {
      ...base,
      classes: [
        { id: 'a|b', name: '6A1', grade: 6, track: 'A', section: 1 },
        { id: 'a', name: '6A2', grade: 6, track: 'A', section: 2 },
      ],
      subjects: [
        ...base.subjects,
        { id: 'c', name: 'Sử', colorKey: 'history' },
        { id: 'b|c', name: 'Địa', colorKey: 'geography' },
      ],
      cards: [card('su', 'c', null, null), card('dia', 'b|c', null, null)],
      placements: [
        { id: 'q1', cardId: 'su', classId: 'a|b', day: 0, block: 0, part: 'full' },
        { id: 'q2', cardId: 'su', classId: 'a|b', day: 0, block: 1, part: 'full' },
        { id: 'q3', cardId: 'dia', classId: 'a', day: 0, block: 0, part: 'full' },
        { id: 'q4', cardId: 'dia', classId: 'a', day: 0, block: 1, part: 'full' },
      ],
    };
    const issues = check(file, 'subjectTwiceInDay');
    expect(issues.map((i) => i.message)).toEqual([
      '6A1 has Sử twice on Monday',
      '6A2 has Địa twice on Monday',
    ]);
    expect(new Set(issues.map((i) => i.id)).size).toBe(2);
  });
});

describe('cards with no teacher or no room', () => {
  it("skip a teacher or room that isn't in the lists", () => {
    const base = school([at('ghost', '6A1', 0, 0), at('ghost', '6A2', 0, 0)]);
    const file = { ...base, cards: [...base.cards, card('ghost', 'van', 'gone', 'nowhere')] };
    expect(checkTimetable(file)).toEqual([]);
  });

  it('are left out of the teacher and room checks', () => {
    expect(checkTimetable(school([at('nobody', '6A1', 0, 0), at('nobody', '6A2', 0, 0)]))).toEqual(
      [],
    );
    expect(
      check(
        school([at('lanToan', '6A1', 0, 0), at('nobody', '6A2', 0, 0)]),
        'roomTwice',
        'teacherTwice',
      ),
    ).toEqual([]);
  });
});

/** Thầy Phúc with one condition, switched on. */
const withCondition = (placements: Placement[], condition: ConditionValues) =>
  school(placements, [{ id: 'c1', on: true, ...condition }] as TeacherCondition[]);

describe('teacher conditions, each just at its limit and one over', () => {
  it('subject limit a day: half blocks count as 1 period, across classes', () => {
    const three = [at('phuc1', '6A1', 0, 0), at('phuc2', '6A2', 0, 1, 'first')];
    const limit = {
      type: 'subjectLimit',
      subjectId: 'toan',
      max: 3,
      per: 'day',
    } satisfies ConditionValues;
    expect(check(withCondition(three, limit), 'subjectLimit')).toEqual([]);
    const four = [...three, at('phuc1', '7B1', 0, 2, 'second')];
    const issues = check(withCondition(four, limit), 'subjectLimit');
    expect(
      issues.map((i) => [i.id, i.conditionId, i.message, i.where, i.placementIds.length]),
    ).toEqual([
      [
        '["subjectLimit","phuc","c1",0]',
        'c1',
        'Thầy Phúc: 4 periods of Toán on Monday, limit is 3',
        '6A1, 6A2, 7B1 · Monday · Periods 1–2, 3, and 6',
        3,
      ],
    ]);
  });

  it('subject limit a week counts only that subject', () => {
    const limit = {
      type: 'subjectLimit',
      subjectId: 'toan',
      max: 4,
      per: 'week',
    } satisfies ConditionValues;
    const four = [at('phuc1', '6A1', 0, 0), at('phuc1', '6A1', 2, 0)];
    expect(check(withCondition(four, limit), 'subjectLimit')).toEqual([]);
    const five = [...four, at('phuc2', '6A2', 4, 4, 'first')];
    expect(
      check(withCondition(five, limit), 'subjectLimit').map((i) => [i.message, i.where]),
    ).toEqual([['Thầy Phúc: 5 periods of Toán this week, limit is 4', '6A1, 6A2 · Whole week']]);
  });

  it('unavailable times: any lesson in one of the blocks on one of the days, half included', () => {
    const afternoonMonday = {
      type: 'unavailable',
      blocks: [3, 4],
      days: [0],
    } satisfies ConditionValues;
    const fine = [at('phuc1', '6A1', 0, 2), at('phuc1', '6A1', 1, 3)];
    expect(check(withCondition(fine, afternoonMonday), 'unavailable')).toEqual([]);
    const issues = check(
      withCondition([...fine, at('phuc1', '6A2', 0, 3, 'first')], afternoonMonday),
      'unavailable',
    );
    expect(issues.map((i) => [i.id, i.message, i.where])).toEqual([
      [
        '["unavailable","phuc","c1",0,3]',
        "Thầy Phúc can't teach in periods 7–8 on Monday",
        '6A2 · Monday · Period 7',
      ],
    ]);
  });

  it('days off: any lesson on that day', () => {
    const wednesday = { type: 'daysOff', days: [2] } satisfies ConditionValues;
    expect(check(withCondition([at('phuc1', '6A1', 1, 1)], wednesday), 'daysOff')).toEqual([]);
    const issues = check(
      withCondition([at('phuc1', '6A1', 2, 1), at('phuc1', '6A1', 2, 3)], wednesday),
      'daysOff',
    );
    expect(issues.map((i) => [i.message, i.where])).toEqual([
      [
        'Thầy Phúc has Wednesday off but teaches 2 lessons',
        '6A1 · Wednesday · Periods 3–4 and 7–8',
      ],
    ]);
    expect(check(withCondition([at('phuc1', '6A1', 2, 1)], wednesday), 'daysOff')[0]!.message).toBe(
      'Thầy Phúc has Wednesday off but teaches 1 lesson',
    );
  });

  it('most periods per day', () => {
    const max = { type: 'maxPeriodsPerDay', max: 3 } satisfies ConditionValues;
    const three = [
      at('phuc1', '6A1', 3, 0),
      at('lanVan', '6A1', 3, 1),
      at('phuc2', '6A2', 3, 4, 'second'),
    ];
    expect(check(withCondition(three, max), 'maxPeriodsPerDay')).toEqual([]);
    const four = [...three, at('phuc2', '7B1', 3, 2, 'first')];
    const issues = check(withCondition(four, max), 'maxPeriodsPerDay');
    expect(issues.map((i) => [i.message, i.placementIds.length])).toEqual([
      ['Thầy Phúc: 4 periods on Thursday, limit is 3', 3],
    ]);
  });

  it('most periods per week counts every placement across all classes', () => {
    const max = { type: 'maxPeriodsPerWeek', max: 5 } satisfies ConditionValues;
    const five = [
      at('phuc1', '6A1', 0, 0),
      at('phuc1', '6A2', 1, 0),
      at('phuc2', '7B1', 2, 0, 'first'),
    ];
    expect(check(withCondition(five, max), 'maxPeriodsPerWeek')).toEqual([]);
    const issues = check(
      withCondition([...five, at('phuc2', '7B1', 2, 0, 'second')], max),
      'maxPeriodsPerWeek',
    );
    expect(issues.map((i) => [i.id, i.message, i.where, i.classIds])).toEqual([
      [
        '["maxPeriodsPerWeek","phuc","c1","week"]',
        'Thầy Phúc: 6 periods this week, limit is 5',
        '6A1, 6A2, 7B1 · Whole week',
        ['6A1', '6A2', '7B1'],
      ],
    ]);
  });

  it('most blocks in a row: a half is enough to make a block busy', () => {
    const max = { type: 'maxBlocksInRow', max: 2 } satisfies ConditionValues;
    const two = [at('phuc1', '6A1', 0, 0), at('phuc1', '6A2', 0, 1, 'second')];
    expect(check(withCondition(two, max), 'maxBlocksInRow')).toEqual([]);
    const three = [...two, at('phuc1', '7B1', 0, 2, 'first'), at('phuc1', '6A1', 0, 4)];
    const issues = check(withCondition(three, max), 'maxBlocksInRow');
    expect(issues.map((i) => [i.message, i.placementIds.length])).toEqual([
      // The afternoon lesson isn't part of the run.
      ['Thầy Phúc: 3 blocks in a row on Monday, limit is 2', 3],
    ]);
  });

  it('most blocks in a row: lunch ends a run', () => {
    const one = { type: 'maxBlocksInRow', max: 1 } satisfies ConditionValues;
    expect(
      check(
        withCondition([at('phuc1', '6A1', 0, 2), at('phuc1', '6A1', 0, 3)], one),
        'maxBlocksInRow',
      ),
    ).toEqual([]);
    const two = { type: 'maxBlocksInRow', max: 2 } satisfies ConditionValues;
    const fourBlocks = [1, 2, 3, 4].map((b) => at('phuc1', '6A1', 0, b));
    expect(check(withCondition(fourBlocks, two), 'maxBlocksInRow')).toEqual([]);
  });

  it('most blocks in a row: lunch is wherever the bell schedule puts it', () => {
    const base = withCondition(
      [1, 2, 3].map((b) => at('phuc1', '6A1', 0, b)),
      { type: 'maxBlocksInRow', max: 2 },
    );
    expect(check(base, 'maxBlocksInRow')).toEqual([]);
    // Lunch moved to after periods 7–8: blocks 3–4, 5–6, 7–8 are now one run.
    const rows = base.bellSchedule.filter((r) => r.kind === 'block' || r.type !== 'lunch');
    const lunch = base.bellSchedule.find((r) => r.kind === 'break' && r.type === 'lunch')!;
    const afterBlock3 = rows.findIndex((r) => r.kind === 'block' && r.block === 3) + 1;
    const moved = {
      ...base,
      bellSchedule: [...rows.slice(0, afterBlock3), lunch, ...rows.slice(afterBlock3)],
    };
    expect(check(moved, 'maxBlocksInRow').map((i) => i.message)).toEqual([
      'Thầy Phúc: 3 blocks in a row on Monday, limit is 2',
    ]);
  });

  it("most gaps per day: free blocks between the first and last lesson, and lunch isn't one", () => {
    const none = { type: 'maxGapsPerDay', max: 0 } satisfies ConditionValues;
    expect(
      check(
        withCondition([at('phuc1', '6A1', 1, 2), at('phuc1', '6A1', 1, 3)], none),
        'maxGapsPerDay',
      ),
    ).toEqual([]);
    const oneGap = [at('phuc1', '6A1', 1, 0), at('phuc1', '6A2', 1, 2, 'first')];
    expect(
      check(withCondition(oneGap, { type: 'maxGapsPerDay', max: 1 }), 'maxGapsPerDay'),
    ).toEqual([]);
    expect(check(withCondition(oneGap, none), 'maxGapsPerDay').map((i) => i.message)).toEqual([
      'Thầy Phúc: 1 free block between lessons on Tuesday, limit is 0',
    ]);
    const threeGaps = [at('phuc1', '6A1', 1, 0), at('phuc1', '6A1', 1, 4)];
    expect(
      check(withCondition(threeGaps, { type: 'maxGapsPerDay', max: 2 }), 'maxGapsPerDay')[0]!
        .message,
    ).toBe('Thầy Phúc: 3 free blocks between lessons on Tuesday, limit is 2');
  });

  it('most teaching days', () => {
    const max = { type: 'maxTeachingDays', max: 2 } satisfies ConditionValues;
    const two = [
      at('phuc1', '6A1', 0, 0),
      at('phuc1', '6A1', 0, 1),
      at('phuc1', '6A2', 3, 0, 'first'),
    ];
    expect(check(withCondition(two, max), 'maxTeachingDays')).toEqual([]);
    const issues = check(withCondition([...two, at('phuc1', '6A1', 4, 4)], max), 'maxTeachingDays');
    expect(issues.map((i) => [i.message, i.where, i.placementIds.length])).toEqual([
      ['Thầy Phúc teaches on 3 days, limit is 2', '6A1, 6A2 · Whole week', 4],
    ]);
  });

  it('counts only the teacher’s own placements', () => {
    const max = { type: 'maxPeriodsPerDay', max: 2 } satisfies ConditionValues;
    expect(
      check(
        withCondition(
          [at('phuc1', '6A1', 0, 0), at('lanVan', '6A1', 0, 1), at('nobody', '6A2', 0, 2)],
          max,
        ),
        'maxPeriodsPerDay',
      ),
    ).toEqual([]);
  });

  it('several conditions of one type on one teacher each give their own issues', () => {
    const file = school(
      [at('phuc1', '6A1', 0, 0), at('phuc1', '6A2', 0, 1), at('phuc2', '7B1', 0, 2)],
      [
        { id: 'c1', on: true, type: 'subjectLimit', subjectId: 'toan', max: 4, per: 'day' },
        { id: 'c2', on: true, type: 'subjectLimit', subjectId: 'toan', max: 2, per: 'day' },
        { id: 'c3', on: true, type: 'subjectLimit', subjectId: 'van', max: 1, per: 'day' },
      ],
    );
    expect(check(file, 'subjectLimit').map((i) => [i.conditionId, i.message])).toEqual([
      ['c1', 'Thầy Phúc: 6 periods of Toán on Monday, limit is 4'],
      ['c2', 'Thầy Phúc: 6 periods of Toán on Monday, limit is 2'],
    ]);
  });

  it('a condition switched off gives nothing', () => {
    const file = school(
      [at('phuc1', '6A1', 2, 0)],
      [{ id: 'c1', on: false, type: 'daysOff', days: [2] }],
    );
    expect(checkTimetable(file)).toEqual([]);
  });
});

describe('subject twice in a day (warning)', () => {
  it('is a warning for one subject in two blocks of a class on one day, whichever card', () => {
    const issues = check(
      school([at('phuc1', '6A1', 0, 0, 'full', 'a'), at('lanToan', '6A1', 0, 3, 'first', 'b')]),
      'subjectTwiceInDay',
    );
    expect(issues).toEqual([
      {
        id: '["subjectTwiceInDay","6A1","toan",0]',
        severity: 'warning',
        kind: 'subjectTwiceInDay',
        teacherId: null,
        conditionId: null,
        message: '6A1 has Toán twice on Monday',
        where: '6A1 · Monday · Periods 1–2 and 7',
        placementIds: ['a', 'b'],
        classIds: ['6A1'],
      },
    ]);
  });

  it('says how many times past two', () => {
    const issues = check(
      school([at('phuc1', '6A1', 0, 0), at('phuc1', '6A1', 0, 2), at('nobody', '6A1', 0, 4)]),
      'subjectTwiceInDay',
    );
    expect(issues.map((i) => i.message)).toEqual(['6A1 has Toán 3 times on Monday']);
  });

  it('counts both halves of one block once, and other classes and days apart', () => {
    expect(
      checkTimetable(
        school([
          at('phuc1', '6A1', 0, 1, 'first'),
          at('lanToan', '6A1', 0, 1, 'second'),
          at('phuc1', '6A2', 0, 3),
          at('phuc1', '6A1', 1, 3),
        ]),
      ),
    ).toEqual([]);
  });
});

describe('order and ids', () => {
  const placements = () => [
    at('lanVan', '6A1', 0, 0, 'full', 'w1'),
    at('lanVan', '6A1', 0, 3, 'full', 'w2'),
    at('phuc1', '6A1', 1, 0, 'full', 'x1'),
    at('phuc2', '6A2', 1, 0, 'full', 'x2'),
    at('phuc1', '7B1', 0, 1, 'full', 'y1'),
  ];
  const conditions: TeacherCondition[] = [
    { id: 'week', on: true, type: 'maxTeachingDays', max: 1 },
    { id: 'mon', on: true, type: 'daysOff', days: [0] },
  ];

  it('puts errors first, then by first slot, whole-week issues after the day ones', () => {
    const issues = checkTimetable(school(placements(), conditions));
    expect(issues.map((i) => i.id)).toEqual([
      '["daysOff","phuc","mon",0]',
      '["teacherTwice","phuc",1,0,"full"]',
      '["maxTeachingDays","phuc","week","week"]',
      '["subjectTwiceInDay","6A1","van",0]',
    ]);
  });

  it('orders issues at one time by teacher-list order', () => {
    const base = school([
      at('lanToan', '6A1', 0, 0),
      at('lanToan', '6A2', 0, 0),
      at('phuc1', '7B1', 0, 0),
      at('phuc2', '7B2', 0, 0),
    ]);
    const file = {
      ...base,
      classes: [
        ...base.classes,
        { id: '7B2', name: '7B2', grade: 7, track: 'B', section: 2 } as const,
      ],
    };
    expect(checkTimetable(file).map((i) => i.teacherId)).toEqual(['phuc', 'lan']);
    const reversed = { ...file, teachers: [...file.teachers].reverse() };
    expect(checkTimetable(reversed).map((i) => i.teacherId)).toEqual(['lan', 'phuc']);
  });

  it("doesn't depend on the order of the file's placements, cards, or classes", () => {
    const file = school(placements(), conditions);
    const shuffled = {
      ...file,
      placements: [...file.placements].reverse(),
      cards: [...file.cards].reverse(),
      classes: [...file.classes].reverse(),
    };
    expect(checkTimetable(shuffled)).toEqual(checkTimetable(file));
  });

  it('keeps an issue’s id through an unrelated change', () => {
    const before = checkTimetable(school(placements(), conditions)).map((i) => i.id);
    const after = checkTimetable(
      school([...placements(), at('nobody', '6A2', 4, 4)], conditions),
    ).map((i) => i.id);
    expect(after).toEqual(before);
  });

  it('gives nothing for an empty timetable', () => {
    expect(checkTimetable(school())).toEqual([]);
  });
});
