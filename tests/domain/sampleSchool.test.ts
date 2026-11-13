import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CLASSES,
  SAMPLE_ISSUE_COUNTS,
  SAMPLE_ISSUES,
  SAMPLE_PLACED,
} from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { createAppState, selectClass } from '../../src/domain/appState';
import { cardPanelGroups } from '../../src/domain/cardPanel';
import { cardClasses, cardView, editCard, poolCards } from '../../src/domain/cards';
import { checkTimetable } from '../../src/domain/checks';
import {
  classesByGrade,
  classRows,
  deleteClass,
  editClass,
  placedPeriods,
} from '../../src/domain/classes';
import { conditionSentence, setConditionOn } from '../../src/domain/conditions';
import { issueCountsByClass } from '../../src/domain/issues';
import { CONDITION_TYPES, TRACKS, type TimetableFile } from '../../src/domain/model';
import {
  drop,
  movePlacement,
  periodsBySubject,
  removePlacement,
  slotPlacements,
} from '../../src/domain/placements';
import {
  deleteRoom,
  editRoom,
  roomDeletion,
  roomDeletionLines,
  roomRows,
} from '../../src/domain/rooms';
import { defaultColorKey } from '../../src/domain/subjectColor';
import {
  deleteSubject,
  editSubject,
  subjectDeletionLines,
  subjectRows,
} from '../../src/domain/subjects';
import { readTimetableFile, serializeTimetableFile } from '../../src/shared/fileFormat';

// The acceptance criteria against the made-up sample school: release 1's (R1-8),
// release 2's (R2-6), and release 3's (R3-4).

const school = exampleSchool;
const classId = (name: string) => {
  const found = school.classes.find((c) => c.name === name);
  if (!found) throw new Error(`No class ${name}`);
  return found.id;
};
const subjectName = (id: string) => school.subjects.find((s) => s.id === id)?.name;
const messages = (file: TimetableFile) => checkTimetable(file).map((i) => i.message);
const ok = <T extends { ok: boolean }>(result: T) => {
  if (!result.ok) throw new Error('refused');
  return result as Extract<T, { ok: true }>;
};

describe('the sample school', () => {
  it('loads as a saved timetable file (TB-7)', () => {
    const read = readTimetableFile(serializeTimetableFile(school));
    expect(read).toEqual({ ok: true, file: school, upgradedFrom: null });
  });

  it('has classes in all five tracks, about ten subjects, and full and half placements', () => {
    expect(school.classes.map((c) => c.name)).toEqual([...SAMPLE_CLASSES]);
    expect(new Set(school.classes.map((c) => c.track))).toEqual(new Set(TRACKS));
    expect(school.subjects).toHaveLength(10);
    expect(school.placements.some((p) => p.part === 'full')).toBe(true);
    expect(school.placements.some((p) => p.part === 'first')).toBe(true);
    expect(school.placements.some((p) => p.part === 'second')).toBe(true);
  });

  it('only points at things that exist', () => {
    const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
    const [classes, subjects, teachers, rooms, cards] = [
      ids(school.classes),
      ids(school.subjects),
      ids(school.teachers),
      ids(school.rooms),
      ids(school.cards),
    ];
    for (const c of school.cards) {
      expect(subjects.has(c.subjectId)).toBe(true);
      if (c.teacherId !== null) expect(teachers.has(c.teacherId)).toBe(true);
      if (c.roomId !== null) expect(rooms.has(c.roomId)).toBe(true);
    }
    for (const p of school.placements) {
      expect(cards.has(p.cardId)).toBe(true);
      expect(classes.has(p.classId)).toBe(true);
    }
  });

  it("gives each subject the palette its name sets, so there's no color choice", () => {
    for (const s of school.subjects) expect(s.colorKey).toBe(defaultColorKey(s.name));
  });

  it('never has two placements in the same part of a slot, or a full block with a half', () => {
    for (const c of school.classes) {
      for (const p of school.placements) {
        const inSlot = slotPlacements(school, c.id, p.day, p.block);
        const parts = inSlot.map((x) => x.part);
        expect(new Set(parts).size).toBe(parts.length);
        if (parts.includes('full')) expect(parts).toEqual(['full']);
      }
    }
  });
});

describe('TB-1 and TB-4 on the sample school', () => {
  it('counts placed periods per class, 2 for a full block and 1 for a half', () => {
    for (const name of SAMPLE_CLASSES) {
      expect(placedPeriods(school, classId(name))).toBe(SAMPLE_PLACED[name]);
    }
  });

  it('groups the classes by grade for the class bar', () => {
    expect(
      classesByGrade(school.classes).map((g) => [g.grade, g.classes.map((c) => c.name)]),
    ).toEqual([
      [6, ['6A1', '6A2']],
      [7, ['7AA1']],
      [8, ['8CE1']],
      [9, ['9B1', '9BA1']],
    ]);
  });

  it('switching class changes only what is on screen', () => {
    let state = createAppState(school);
    expect(state.selectedClassId).toBe(classId('6A1'));
    state = selectClass(state, classId('8CE1'));
    state = selectClass(state, classId('6A1'));
    expect(state.file).toBe(school);
  });

  it('the panel lists the whole pool for every class, in pool order', () => {
    const panelSubjects = () =>
      cardPanelGroups(school, '', 'subject')
        .flatMap((g) => g.cards)
        .map((c) => subjectName(c.subjectId));
    expect(panelSubjects()).toEqual(poolCards(school).map((c) => subjectName(c.subjectId)));
    expect(panelSubjects()).toHaveLength(school.cards.length);
    expect(panelSubjects().slice(0, 5)).toEqual(['Toán', 'Toán', 'Toán', 'Toán', 'Ngữ văn']);
  });

  it('the "Periods per subject" panel adds up to the placed count', () => {
    const periods = periodsBySubject(school, classId('6A1'));
    expect(periods.map((p) => [subjectName(p.subjectId), p.periods])).toEqual([
      ['Toán', 4],
      ['Ngữ văn', 4],
      ['Tiếng Anh', 2],
      ['Tin học', 2],
      ['Thể dục', 2],
      ['SH lớp', 1],
      ['GDPC', 1],
      ['Toán phân hoá/ Ngoại ngữ 2', 2],
    ]);
    expect(periods.reduce((sum, p) => sum + p.periods, 0)).toBe(SAMPLE_PLACED['6A1']);
  });

  it('allows a teacher in two classes in one block (TB-4)', () => {
    // 6A1 and 6A2 both have Cô Ngân's Ngữ văn on Monday 3–4.
    const teacherAt = (name: string) =>
      slotPlacements(school, classId(name), 0, 1).map(
        (p) => school.cards.find((c) => c.id === p.cardId)?.teacherId,
      );
    expect(teacherAt('6A1')).toEqual(['t-ngan']);
    expect(teacherAt('6A2')).toEqual(['t-ngan']);

    // Dropping the same teacher into another class's busy block still works.
    const result = drop(
      school,
      'k-6a2-toan',
      classId('6A2'),
      { day: 0, block: 0, part: 'full' },
      () => 'new',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(slotPlacements(result.file, classId('6A2'), 0, 0).map((p) => p.cardId)).toEqual([
      'k-6a2-toan',
    ]);
    // Thầy Phúc's 6A1 Toán in the same block is untouched.
    expect(slotPlacements(result.file, classId('6A1'), 0, 0).map((p) => p.cardId)).toEqual([
      'k-6a1-toan',
    ]);
  });

  it("a drop or move in one class leaves every other class's grid alone", () => {
    const others = (file: typeof school) =>
      file.placements.filter((p) => p.classId !== classId('8CE1'));
    const dropped = drop(
      school,
      'k-8ce1-anh',
      classId('8CE1'),
      { day: 0, block: 0, part: 'full' },
      () => 'new',
    );
    const moved = movePlacement(school, 'p-8ce1-3', { day: 0, block: 1, part: 'second' });
    if (!dropped.ok || !moved.ok) throw new Error('drop or move refused');
    expect(others(dropped.file)).toEqual(others(school));
    expect(others(moved.file)).toEqual(others(school));
  });
});

describe('DM-5 on the sample school', () => {
  it('a block where the class splits into groups is one ordinary card', () => {
    const split = school.cards.filter(
      (c) => subjectName(c.subjectId) === 'Toán phân hoá/ Ngoại ngữ 2',
    );
    expect(split).toHaveLength(1);
    expect(cardView(school, split[0]!)).toEqual({
      id: 'k-6a1-split',
      subject: 'Toán phân hoá/ Ngoại ngữ 2',
      colors: { key: 'homeroom', custom: null },
      teacher: 'Thầy Phúc',
      room: 'P102',
    });
  });

  it('the same subject has a card per teacher and room in the pool', () => {
    const toan = school.cards.filter((c) => c.subjectId === 's-toan');
    expect(toan.map((c) => [c.id, c.teacherId, c.roomId])).toEqual([
      ['k-6a1-toan', 't-phuc', 'r-p101'],
      ['k-6a2-toan', 't-quan', 'r-p102'],
      ['k-7aa1-toan', 't-quan', 'r-p201'],
      ['k-9b1-toan', 't-phuc', null],
    ]);
  });

  it('a card placed in two classes lists both, and counts in each', () => {
    expect(cardClasses(school, 'k-anh-vy').map((c) => c.name)).toEqual(['6A1', '6A2']);
    const english = (name: string) =>
      periodsBySubject(school, classId(name)).find((p) => subjectName(p.subjectId) === 'Tiếng Anh');
    expect(english('6A1')?.periods).toBe(2);
    expect(english('6A2')?.periods).toBe(2);
  });

  it("editing a card's teacher and room shows on every placement of it", () => {
    const result = editCard(school, 'k-6a1-toan', {
      subjectId: 's-toan',
      teacherId: 't-quan',
      roomId: null,
    });
    if (!result.ok) throw new Error(result.error);
    const toanPlacements = result.file.placements.filter((p) => p.cardId === 'k-6a1-toan');
    expect(toanPlacements).toHaveLength(2);
    expect(result.file.placements).toEqual(school.placements);
    const edited = result.file.cards.find((c) => c.id === 'k-6a1-toan')!;
    expect(cardView(result.file, edited)).toMatchObject({ teacher: 'Thầy Quân', room: null });
  });

  it('editing the shared card keeps its placements on both grids', () => {
    const result = editCard(school, 'k-anh-vy', {
      subjectId: 's-anh',
      teacherId: 't-vy',
      roomId: 'r-p102',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.file.placements).toEqual(school.placements);
    expect(result.file.cards.find((c) => c.id === 'k-anh-vy')?.roomId).toBe('r-p102');
  });
});

describe('Release 2 on the sample school', () => {
  it('finds every issue across all classes, errors first, each saying what and where (TC-2, TC-3)', () => {
    expect(checkTimetable(school).map((i) => [i.severity, i.message, i.where])).toEqual(
      SAMPLE_ISSUES.map((i) => [...i]),
    );
  });

  it('breaks each condition type once, and a condition just at its limit gives nothing (TC-1, TC-2)', () => {
    const broken = checkTimetable(school).filter((i) => i.conditionId !== null);
    expect(new Set(broken.map((i) => i.kind))).toEqual(new Set(CONDITION_TYPES));
    expect(broken).toHaveLength(CONDITION_TYPES.length);
    // Cô Vy's 4 periods a week, Cô Trâm's 4 periods on Thursday, and Thầy Hiếu's one
    // period of Tin học on Wednesday are each just at the limit.
    const ids = new Set(broken.map((i) => i.conditionId));
    expect(ids.has('cond-vy-week')).toBe(false);
    expect(ids.has('cond-tram-day')).toBe(false);
    expect(broken.find((i) => i.conditionId === 'cond-hieu-tin')?.where).toMatch(/Friday/);
  });

  it('a switched-off condition gives nothing until it is switched on (TC-1)', () => {
    expect(messages(school).some((m) => m.startsWith("Thầy Tùng can't teach"))).toBe(false);
    const on = setConditionOn(school, 't-tung', 'cond-tung-pm', true);
    expect(messages(on)).toContain("Thầy Tùng can't teach in periods 7–8 on Tuesday");
  });

  it("two half cards of one teacher sharing a block across classes aren't a clash (TC-2)", () => {
    const clashes = checkTimetable(school).filter(
      (i) => i.kind === 'teacherTwice' || i.kind === 'roomTwice',
    );
    expect(clashes.map((i) => i.message)).toEqual([
      'Cô Ngân is in 6A1 and 6A2 at the same time',
      'Room P201 has 6A2 and 7AA1 at the same time',
    ]);
    // In the same half, Thầy Hiếu and Phòng Tin 1 are each in two places.
    const sameHalf = ok(movePlacement(school, 'p-7aa1-7', { day: 4, block: 2, part: 'second' }));
    expect(messages(sameHalf.file)).toEqual(
      expect.arrayContaining([
        'Thầy Hiếu is in 6A1 and 7AA1 at the same time',
        'Room Phòng Tin 1 has 6A1 and 7AA1 at the same time',
      ]),
    );
  });

  it("counts each class's errors and warnings for its tile (TB-1)", () => {
    const counts = issueCountsByClass(checkTimetable(school));
    for (const name of SAMPLE_CLASSES) {
      expect(counts.get(classId(name)) ?? { errors: 0, warnings: 0 }).toEqual(
        SAMPLE_ISSUE_COUNTS[name],
      );
    }
  });

  it('a drop that puts a teacher in two places is allowed, and adds an error in both classes (TB-4, TC-4)', () => {
    const dropped = ok(
      drop(school, 'k-6a1-toan', classId('8CE1'), { day: 0, block: 0, part: 'full' }, () => 'new'),
    );
    const before = new Set(messages(school));
    const added = checkTimetable(dropped.file).filter((i) => !before.has(i.message));
    expect(added.map((i) => [i.message, i.classIds])).toEqual([
      ['Thầy Phúc is in 6A1 and 8CE1 at the same time', [classId('6A1'), classId('8CE1')]],
      ['Room P101 has 6A1 and 8CE1 at the same time', [classId('6A1'), classId('8CE1')]],
    ]);
  });

  it('a teacher shared with THPT is checked like any other (TC-2)', () => {
    // Thầy Đạt (THPT) has 7AA1 on Wednesday 7–8; his other card, dropped on 8CE1 then,
    // puts him in two places. Thầy Phúc (both schools) is the drop above.
    const dropped = ok(
      drop(school, 'k-9b1-ly', classId('8CE1'), { day: 2, block: 3, part: 'full' }, () => 'new'),
    );
    expect(messages(dropped.file)).toContain('Thầy Đạt is in 7AA1 and 8CE1 at the same time');
  });

  it('moving, replacing, removing, and editing a card update the issues at once (TB-5, DM-5, TC-2)', () => {
    const clash = 'Cô Ngân is in 6A1 and 6A2 at the same time';
    // Moved away, Cô Ngân's clash goes.
    const moved = ok(movePlacement(school, 'p-6a2-1', { day: 1, block: 2, part: 'full' }));
    expect(messages(moved.file)).not.toContain(clash);
    // Replaced by another card, it goes too.
    const replaced = ok(
      drop(school, 'k-6a2-toan', classId('6A2'), { day: 0, block: 1, part: 'full' }, () => 'new'),
    );
    expect(messages(replaced.file)).not.toContain(clash);
    // Removing 7AA1's second KHTN - Lý clears Thầy Đạt's three and the warning.
    const removed = removePlacement(school, 'p-7aa1-4');
    expect(messages(removed).filter((m) => m.includes('Đạt') || m.includes('Lý'))).toEqual([]);
    // Giving Cô Vy's card to Thầy Quân clears her days and puts him in two places on
    // Tuesday 1–2.
    const edited = ok(
      editCard(school, 'k-anh-vy', { subjectId: 's-anh', teacherId: 't-quan', roomId: 'r-p101' }),
    );
    expect(messages(edited.file)).not.toContain('Cô Vy teaches on 2 days, limit is 1');
    expect(messages(edited.file)).toContain('Thầy Quân is in 6A1 and 6A2 at the same time');
  });

  it("changing only a card's room clears a room clash or makes one (TC-2, DM-5)", () => {
    const p201 = 'Room P201 has 6A2 and 7AA1 at the same time';
    const p101 = 'Room P101 has 6A1 and 6A2 at the same time';
    expect(messages(school)).toContain(p201);
    // 6A2's Wednesday 7–8 card moves from P201 to P202: the clash goes.
    const cleared = ok(
      editCard(school, 'k-7aa1-toan', {
        subjectId: 's-toan',
        teacherId: 't-quan',
        roomId: 'r-p202',
      }),
    );
    expect(messages(cleared.file)).not.toContain(p201);
    // 6A2's Tuesday 1–2 card moves into P101, where 6A1 has Tiếng Anh then.
    expect(messages(school)).not.toContain(p101);
    const made = ok(
      editCard(school, 'k-6a2-toan', {
        subjectId: 's-toan',
        teacherId: 't-quan',
        roomId: 'r-p101',
      }),
    );
    expect(messages(made.file)).toContain(p101);
  });
});

describe('Release 3 on the sample school', () => {
  const sampleMessages = SAMPLE_ISSUES.map(([, message]) => message as string);
  const without = (...gone: string[]) => sampleMessages.filter((m) => !gone.includes(m));
  const classNames = (file: TimetableFile, cardId: string) =>
    cardClasses(file, cardId).map((c) => c.name);

  it('lists the classes in class-bar order with both teachers and periods placed (DM-2)', () => {
    expect(
      classRows(school, '').map((r) => [
        r.schoolClass.name,
        r.homeroom?.shortName ?? '—',
        r.assistant?.shortName ?? '—',
        r.placed,
      ]),
    ).toEqual([
      ['6A1', 'Cô Ngân', 'Thầy Quân', SAMPLE_PLACED['6A1']],
      ['6A2', 'Thầy Phúc', '—', SAMPLE_PLACED['6A2']],
      ['7AA1', 'Thầy Đạt', 'Cô Trâm', SAMPLE_PLACED['7AA1']],
      ['8CE1', 'Cô Trâm', 'Cô Vy', SAMPLE_PLACED['8CE1']],
      ['9B1', 'Thầy Hiếu', '—', SAMPLE_PLACED['9B1']],
      ['9BA1', '—', '—', SAMPLE_PLACED['9BA1']],
    ]);
  });

  it.each([
    ['tram', ['7AA1', '8CE1']],
    ['ung ngoc', ['7AA1', '8CE1']],
    ['9B', ['9B1', '9BA1']],
    ['QUÂN', ['6A1']],
  ])(
    'searches the classes for %j by name or either teacher, ignoring case and accents (DM-2)',
    (query, names) => {
      expect(classRows(school, query).map((r) => r.schoolClass.name)).toEqual(names);
    },
  );

  it('renaming a class into another grade keeps its grid and its issues (DM-2)', () => {
    const renamed = ok(
      editClass(school, classId('6A2'), {
        name: '7A2',
        formTeacherId: 't-phuc',
        coTeacherId: null,
      }),
    ).file;
    expect(renamed.placements).toBe(school.placements);
    expect(classesByGrade(renamed.classes).map((g) => g.classes.map((c) => c.name))).toEqual([
      ['6A1'],
      ['7A2', '7AA1'],
      ['8CE1'],
      ['9B1', '9BA1'],
    ]);
    expect(placedPeriods(renamed, classId('6A2'))).toBe(SAMPLE_PLACED['6A2']);
    // Each issue keeps its severity and classes; what and where name the class 7A2 now.
    const issues = (file: TimetableFile, rename: (text: string) => string) =>
      checkTimetable(file)
        .map((i) => [i.severity, rename(i.message), rename(i.where), i.classIds.join(' ')])
        .sort((a, b) => a.join('|').localeCompare(b.join('|')));
    expect(issues(renamed, (text) => text)).toEqual(
      issues(school, (text) => text.replaceAll('6A2', '7A2')),
    );
  });

  it('deleting the class on screen takes its placements and issues, keeps the cards, and shows 6A1 (DM-2)', () => {
    expect(placedPeriods(school, classId('6A2'))).toBe(8);
    expect(school.placements.filter((p) => p.classId === classId('6A2'))).toHaveLength(4);
    const state = selectClass(createAppState(school), classId('6A2'));
    const next = deleteClass(state, classId('6A2'));
    expect(next.selectedClassId).toBe(classId('6A1'));
    expect(next.file.cards).toBe(school.cards);
    expect(next.file.placements).toHaveLength(school.placements.length - 4);
    // Cô Vy's Tiếng Anh was on both 6A grids, and 7AA1's Toán was placed in 6A2 too.
    expect(classNames(next.file, 'k-anh-vy')).toEqual(['6A1']);
    expect(classNames(next.file, 'k-7aa1-toan')).toEqual(['7AA1']);
    expect(messages(next.file)).toEqual(
      without(
        'Cô Ngân is in 6A1 and 6A2 at the same time',
        'Room P201 has 6A2 and 7AA1 at the same time',
        'Cô Vy teaches on 2 days, limit is 1',
      ),
    );
  });

  it('lists the rooms with their cards and classes, and searches them (DM-3)', () => {
    expect(
      roomRows(school, '').map((r) => [r.room.name, r.cards, r.classes.map((c) => c.name)]),
    ).toEqual([
      ['P101', 3, ['6A1', '6A2']],
      ['P102', 3, ['6A1', '6A2']],
      ['P201', 2, ['6A2', '7AA1']],
      ['P202', 2, ['7AA1', '8CE1']],
      ['Phòng Tin 1', 1, ['6A1', '7AA1']],
      ['Sân thể chất', 1, ['6A1']],
    ]);
    expect(roomRows(school, 'phong tin').map((r) => r.room.name)).toEqual(['Phòng Tin 1']);
  });

  it('renaming a room shows in its clash at once (DM-3)', () => {
    const renamed = ok(editRoom(school, 'r-p201', 'P205')).file;
    expect(messages(renamed)).toContain('Room P205 has 6A2 and 7AA1 at the same time');
    expect(messages(renamed)).not.toContain('Room P201 has 6A2 and 7AA1 at the same time');
  });

  it("deleting P101 merges Thầy Phúc's Toán into his card with no room, keeping every placement (DM-3)", () => {
    const { cards, placements, merges } = roomDeletion(school, 'r-p101');
    expect(cards.map((c) => c.id)).toEqual(['k-6a1-toan', 'k-6a1-van', 'k-anh-vy']);
    expect(placements).toBe(6);
    expect(merges.map((m) => [m.card.id, m.into.id])).toEqual([['k-6a1-toan', 'k-9b1-toan']]);
    expect(roomDeletionLines(school, 'r-p101')).toEqual([
      "3 cards use P101, on the grid 6 times. They'll be left with no room and stay on the grid where they are.",
      "Toán · Thầy Phúc becomes the same as a card that has no room, so the two are merged, keeping both cards' places on the grid.",
      "This can't be undone.",
    ]);
    const file = deleteRoom(school, 'r-p101');
    expect(file.cards.some((c) => c.id === 'k-6a1-toan')).toBe(false);
    expect(file.placements).toHaveLength(school.placements.length);
    expect(classNames(file, 'k-9b1-toan')).toEqual(['6A1']);
    for (const name of SAMPLE_CLASSES) {
      expect(placedPeriods(file, classId(name))).toBe(SAMPLE_PLACED[name]);
    }
    expect(messages(file)).toEqual(sampleMessages);
    // Deleting P201 instead clears its clash.
    expect(messages(deleteRoom(school, 'r-p201'))).toEqual(
      without('Room P201 has 6A2 and 7AA1 at the same time'),
    );
  });

  it('lists the subjects in subject order with their cards (DM-4)', () => {
    expect(subjectRows(school, '').map((r) => [r.subject.name, r.cards])).toEqual([
      ['Toán', 4],
      ['Ngữ văn', 2],
      ['Tiếng Anh', 2],
      ['KHTN - Lý', 2],
      ['Lịch sử', 1],
      ['Tin học', 1],
      ['Thể dục', 1],
      ['SH lớp', 2],
      ['GDPC', 1],
      ['Toán phân hoá/ Ngoại ngữ 2', 1],
    ]);
    expect(subjectRows(school, 'toan').map((r) => r.subject.name)).toEqual([
      'Toán',
      'Toán phân hoá/ Ngoại ngữ 2',
    ]);
  });

  it('renaming a subject changes its colors, its cards, its condition, and its issue at once (DM-4)', () => {
    const file = ok(editSubject(school, 's-tin', 'Công nghệ')).file;
    const tin = file.cards.find((c) => c.id === 'k-6a1-tin')!;
    expect(cardView(file, tin)).toMatchObject({
      subject: 'Công nghệ',
      colors: { key: 'technology', custom: null },
    });
    const hieu = file.teachers.find((t) => t.id === 't-hieu')!;
    expect(conditionSentence(file, hieu.conditions[0]!)).toContain('Công nghệ');
    expect(messages(file)).toContain('Thầy Hiếu: 2 periods of Công nghệ on Friday, limit is 1');
    // The "Periods per subject" tag keeps its periods and reads the new name from the list.
    expect(periodsBySubject(file, classId('6A1'))).toEqual(
      periodsBySubject(school, classId('6A1')),
    );
    expect(file.subjects.find((s) => s.id === 's-tin')).toMatchObject({
      name: 'Công nghệ',
      colorKey: 'technology',
    });
  });

  it("deleting Tin học says Thầy Hiếu's subject limit goes, and takes it and its issue (DM-4)", () => {
    expect(subjectDeletionLines(school, 's-tin')).toEqual([
      '1 card of Tin học is on the grid 3 times, in 6A1 and 7AA1. The card and its places on the grid are deleted.',
      "Thầy Hiếu's subject limit on Tin học goes too.",
      "This can't be undone.",
    ]);
    const file = deleteSubject(school, 's-tin');
    const hieu = file.teachers.find((t) => t.shortName === 'Thầy Hiếu');
    expect(hieu?.conditions.some((c) => c.type === 'subjectLimit')).toBe(false);
    expect(messages(file)).toEqual(
      without('Thầy Hiếu: 2 periods of Tin học on Friday, limit is 1'),
    );
  });

  it('deleting Lịch sử takes its card off both grids, and the issue it was in goes (DM-4)', () => {
    expect(subjectDeletionLines(school, 's-su')).toEqual([
      '1 card of Lịch sử is on the grid 3 times, in 7AA1 and 8CE1. The card and its places on the grid are deleted.',
      "This can't be undone.",
    ]);
    const file = deleteSubject(school, 's-su');
    expect(file.cards.some((c) => c.subjectId === 's-su')).toBe(false);
    expect(placedPeriods(file, classId('7AA1'))).toBe(SAMPLE_PLACED['7AA1'] - 2);
    expect(placedPeriods(file, classId('8CE1'))).toBe(SAMPLE_PLACED['8CE1'] - 3);
    expect(messages(file)).toEqual(without('Cô Trâm: 2 blocks in a row on Thursday, limit is 1'));
  });
});
