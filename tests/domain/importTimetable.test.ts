import { describe, expect, it } from 'vitest';
import { referenceWorkbookData } from '../../fixtures/referenceWorkbook';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { DEFAULT_BELL_SCHEDULE } from '../../src/domain/bellSchedule';
import { periodCode } from '../../src/domain/exportSheets';
import {
  bellTimesNote,
  importFoundRows,
  importNoticeText,
  importQuestion,
  importsSomething,
  importTimetable,
  problemPlace,
  shownProblems,
  type ImportProblem,
  type ImportSummary,
} from '../../src/domain/importTimetable';
import {
  suggestImport,
  type ImportChoices,
  type WorkbookData,
  type WorkbookSheet,
} from '../../src/domain/importWorkbook';
import { fileProblem } from '../../src/domain/integrity';
import type { Id, Teacher, TimetableFile } from '../../src/domain/model';
import { defaultColorKey } from '../../src/domain/subjectColor';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

// IE-1's rules (SYSTEM_DESIGN §12.3–12.4). The sheets copy the shapes of the school's
// workbook with made-up names. In `grid`, Monday periods 1–2's subject row is sheet row 2 and
// its teacher row 3, and the class columns start at F.

const sheet = (name: string, rows: string[][], hidden = false): WorkbookSheet => ({
  name,
  hidden,
  rows,
});

const HEAD = ['Thứ\nDay', '', '', 'Tiết\nPeriod', 'Thời gian\nTime'];
const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu'];
const TIMES = DEFAULT_BELL_SCHEDULE.flatMap((r) =>
  r.kind === 'block' ? [`${r.start.replace(/^0/, '')} - ${r.end.replace(/^0/, '')}`] : [],
);

/** Subject and teacher of each class, by "day-block" ("0-0" is Monday periods 1–2). */
type Slots = Record<string, [string, string?][]>;

function grid(classes: string[], slots: Slots = {}, name = 'HK1'): WorkbookSheet {
  const rows = [[...HEAD, ...classes]];
  for (let day = 0; day < 5; day++) {
    for (let block = 0; block < 5; block++) {
      const start = [DAY_NAMES[day]!, `Th${day + 2}`, `T${day + 2}`];
      const cells = slots[`${day}-${block}`] ?? [];
      rows.push([
        ...start,
        periodCode(block as 0),
        TIMES[block]!,
        ...classes.map((_, i) => cells[i]?.[0] ?? ''),
      ]);
      rows.push([...start, '', '', ...classes.map((_, i) => cells[i]?.[1] ?? '')]);
    }
  }
  return sheet(name, rows);
}

const TEACHER_HEAD = [
  'TT',
  'HỌ TÊN',
  'HỌ TÊN',
  'ĐIỆN THOẠI',
  'EMAIL',
  'TRƯỜNG DẠY CHÍNH',
  'TRƯỜNG KIÊM NHIỆM',
];

/** `ID GV 1S`: each row is [full, short, phone, email, school, also], from sheet row 3. */
function teachersSheet(rows: string[][]): WorkbookSheet {
  return sheet('ID GV 1S', [[], TEACHER_HEAD, ...rows.map((r, i) => [String(i + 1), ...r])]);
}

/** `Data `: each row is [class, homeroom, assistant], from sheet row 2, in columns A to C. */
function classesSheet(rows: string[][]): WorkbookSheet {
  return sheet('Data ', [['Lớp', 'GVCN/Form Teacher:', 'PCN/Co-teacher'], ...rows]);
}

function workbook(...sheets: WorkbookSheet[]): WorkbookData {
  return { fileName: 'TKB.xlsx', sheets };
}

function run(
  data: WorkbookData,
  into: TimetableFile = createEmptyTimetable(),
  change: (choices: ImportChoices) => void = () => {},
) {
  const choices = suggestImport(data);
  change(choices);
  const result = importTimetable(data, choices, into);
  expect(fileProblem(result.file)).toBeNull();
  return result;
}

const said = (problems: readonly ImportProblem[]) =>
  problems.map((p) => `${p.sheet} ${p.cell}: ${p.message}`);

/** The file's placements as "class day block part subject teacher" lines, sorted. */
function placements(file: TimetableFile): string[] {
  const className = new Map(file.classes.map((c) => [c.id, c.name]));
  const cards = new Map(file.cards.map((c) => [c.id, c]));
  const subject = new Map(file.subjects.map((s) => [s.id, s.name]));
  const teacher = new Map<Id | null, string>(file.teachers.map((t) => [t.id, t.shortName]));
  return file.placements
    .map((p) => {
      const card = cards.get(p.cardId)!;
      return [
        className.get(p.classId),
        p.day,
        p.block,
        p.part,
        subject.get(card.subjectId),
        teacher.get(card.teacherId) ?? '-',
      ].join(' ');
    })
    .sort();
}

const byShortName = (file: TimetableFile, shortName: string) =>
  file.teachers.find((t) => t.shortName === shortName);

const names = (items: readonly { name: string }[]) => items.map((i) => i.name);
const shortNames = (teachers: readonly Teacher[]) => teachers.map((t) => t.shortName);

describe('reading the timetable sheet', () => {
  it('places each block and makes one card per subject and teacher, with no room', () => {
    const { file, summary } = run(
      workbook(
        grid(['6A1', '6A2'], {
          '0-0': [
            ['Toán', 'T. Hoa'],
            ['Toán', 'T. Hoa'],
          ],
          '1-2': [['Ngữ văn', 'T. Lan']],
        }),
      ),
    );
    expect(names(file.classes)).toEqual(['6A1', '6A2']);
    expect(file.grades).toEqual([6]);
    expect(placements(file)).toEqual([
      '6A1 0 0 full Toán T. Hoa',
      '6A1 1 2 full Ngữ văn T. Lan',
      '6A2 0 0 full Toán T. Hoa',
    ]);
    expect(file.cards).toHaveLength(2);
    expect(file.cards.every((c) => c.roomId === null)).toBe(true);
    expect(file.rooms).toEqual([]);
    expect(summary).toMatchObject({
      teachers: { added: 2, updated: 0 },
      classes: { added: 2, updated: 0 },
      subjects: { added: 2, updated: 0 },
      cards: { added: 2, updated: 0 },
      placements: 3,
      cardsWithoutTeacher: 0,
      gridsReplaced: 0,
    });
  });

  it('gives a new subject the colors of its name, kept as the cell names it', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán Bộ giáo dục/ Maths', 'T. Hoa']] })),
    );
    expect(file.subjects).toEqual([
      {
        id: expect.any(String),
        name: 'Toán Bộ giáo dục/ Maths',
        colorKey: defaultColorKey('Toán Bộ giáo dục/ Maths'),
      },
    ]);
  });

  it('reads halves, two halves, and SH lớp-GDPC', () => {
    const { file } = run(
      workbook(
        grid(['6A1'], {
          '0-0': [['Toán (first half)', 'T. Hoa']],
          '0-1': [['Toán + Ngữ văn', 'T. Hoa + T. Lan']],
          '0-2': [['Toán', 'T. Hoa + T. Lan']],
          '0-3': [['SH lớp-GDPC/ Class meeting', 'T. Hoa']],
        }),
      ),
    );
    expect(placements(file)).toEqual([
      '6A1 0 0 first Toán T. Hoa',
      '6A1 0 1 first Toán T. Hoa',
      '6A1 0 1 second Ngữ văn T. Lan',
      '6A1 0 2 first Toán T. Hoa',
      '6A1 0 2 second Toán T. Lan',
      '6A1 0 3 first Sinh hoạt lớp T. Hoa',
      '6A1 0 3 second Giáo dục phẩm chất T. Hoa',
    ]);
  });

  it('makes a card with no teacher from an empty teacher cell, and counts it', () => {
    const { file, summary } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán']], '0-1': [['Toán']] })),
    );
    expect(file.cards).toEqual([
      { id: expect.any(String), subjectId: file.subjects[0]!.id, teacherId: null, roomId: null },
    ]);
    expect(summary.cardsWithoutTeacher).toBe(1);
    expect(summary.placements).toBe(2);
  });

  it('reads no teachers from a sheet with no teacher rows', () => {
    const data = grid(['6A1'], { '0-0': [['Toán']], '0-1': [['Ngữ văn']] });
    data.rows = data.rows.filter((row, i) => i === 0 || row[3] !== '');
    data.rows[1]![5] = 'Toán';
    data.rows[2]![5] = 'Ngữ văn';
    const { file } = run(workbook(data));
    expect(file.teachers).toEqual([]);
    expect(placements(file)).toEqual(['6A1 0 0 full Toán -', '6A1 0 1 full Ngữ văn -']);
  });

  it('leaves out a mistyped class column and still reads the classes after it', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1', '6Z1', '6A2'], {
          '0-0': [
            ['Toán', 'T. Hoa'],
            ['Toán', 'T. Hoa'],
            ['Toán', 'T. Hoa'],
          ],
        }),
      ),
    );
    expect(names(file.classes)).toEqual(['6A1', '6A2']);
    expect(file.placements).toHaveLength(2);
    expect(said(problems)).toEqual(["HK1 G1: 6Z1 isn't a class name, so its column is left out."]);
  });

  it('reads no teachers from break rows under the blocks of a sheet with no teacher rows', () => {
    const data = grid(['6A1']);
    data.rows = data.rows.flatMap((row, i) => {
      if (i === 0) return [row];
      if (row[3] === '') return [];
      return [
        [...row.slice(0, 5), 'Toán'],
        [...row.slice(0, 3), '', '9:10 - 9:20', 'Giờ chơi/ Break'],
      ];
    });
    const { file } = run(workbook(data));
    expect(file.teachers).toEqual([]);
    expect(file.placements).toHaveLength(25);
  });

  it('reads the teacher row when the block’s time is merged down onto it', () => {
    const data = grid(['6A1'], { '0-0': [['Toán', 'T. Hoa']] });
    data.rows[2]![4] = data.rows[1]![4]!;
    expect(placements(run(workbook(data)).file)).toEqual(['6A1 0 0 full Toán T. Hoa']);
  });

  it('reports a mistyped first class column', () => {
    const { file, problems } = run(workbook(grid(['6Z1', '6A1'])));
    expect(names(file.classes)).toEqual(['6A1']);
    expect(said(problems)).toEqual(["HK1 F1: 6Z1 isn't a class name, so its column is left out."]);
  });

  it('says when classes after a gap or a repeated name are left out', () => {
    const { file, problems } = run(workbook(grid(['6A1', '6A2', '6A1', '7A1', '7A2'])));
    expect(names(file.classes)).toEqual(['6A1', '6A2']);
    expect(said(problems)).toEqual([
      'HK1 H1: The class names stop at this column, with a blank or repeated cell, so 7A1 and 7A2 are left out.',
    ]);
  });

  it('says when a block has no row, and leaves that block empty', () => {
    const data = grid(['6A1'], { '1-1': [['Toán', 'T. Hoa']] });
    data.rows = data.rows.filter((row) => !(row[1] === 'Th3' && row[3] === 'THCS34'));
    const { file, problems } = run(workbook(data));
    expect(said(problems)).toEqual([
      'HK1 : Tuesday has no row for periods 3–4, so that block stays empty.',
    ]);
    // The teacher row under the missing block is an ordinary row now, and isn't read.
    expect(file.placements).toEqual([]);
  });

  it('uses the first row of a repeated block and leaves out the rest', () => {
    const data = grid(['6A1'], { '0-0': [['Toán', 'T. Hoa']] });
    data.rows.push(['Thứ Hai', 'Th2', 'T2', 'THCS12', TIMES[0]!, 'Ngữ văn']);
    data.rows.push(['Thứ Hai', 'Th2', 'T2', '', '', 'T. Lan']);
    const { file, problems } = run(workbook(data));
    expect(placements(file)).toEqual(['6A1 0 0 full Toán T. Hoa']);
    expect(said(problems)).toEqual([
      'HK1 D52: Monday periods 1–2 is here a second time (first on row 2), so this row is left out.',
    ]);
  });

  it('leaves out rows on no day the import can read, and on a sixth day', () => {
    const data = grid(['6A1']);
    data.rows.splice(1, 0, ['', '', '', 'THCS12', TIMES[0]!, 'Toán']);
    data.rows.push(['Thứ Bảy', 'Th7', 'T7', 'THCS12', TIMES[0]!, 'Toán']);
    const { file, problems } = run(workbook(data));
    expect(file.placements).toEqual([]);
    expect(said(problems)).toEqual([
      "HK1 D2: This row doesn't say which day it's on, so it's left out.",
      'HK1 D53: The grid has five days, Monday to Friday, so this row is left out.',
    ]);
  });

  it('notes when the sheet’s times differ from the bell schedule', () => {
    expect(run(workbook(grid(['6A1']))).summary.bellTimesDiffer).toBe(false);
    const data = grid(['6A1']);
    data.rows[1]![4] = '7:30 - 8:40';
    expect(run(workbook(data)).summary.bellTimesDiffer).toBe(true);
    const unreadable = grid(['6A1']);
    unreadable.rows[1]![4] = '';
    expect(run(workbook(unreadable)).summary.bellTimesDiffer).toBe(false);
  });

  it('imports nothing without a timetable sheet, and says so', () => {
    const into = createEmptyTimetable();
    const data = workbook(grid(['6A1']));
    const none = run(data, into, (c) => {
      c.timetable.sheet = null;
    });
    expect(none.file).toBe(into);
    expect(none.summary.placements).toBe(0);
    expect(said(none.problems)).toEqual([
      ' : No sheet is chosen for the timetable, so nothing is imported.',
    ]);
  });

  it('imports nothing from a sheet not laid out as a timetable, and says so', () => {
    const into = createEmptyTimetable();
    const data = workbook(sheet('Notes', [['Ghi chú']]));
    const result = run(data, into, (c) => {
      c.timetable.sheet = 'Notes';
    });
    expect(result.file).toBe(into);
    expect(said(result.problems)).toEqual([
      "Notes : This sheet isn't laid out as a timetable, with class names across the top and a period code on each block's row, so nothing is imported.",
    ]);
  });
});

describe('teachers', () => {
  const used = (...teachers: string[]) =>
    grid(['6A1'], Object.fromEntries(teachers.map((t, i) => [`0-${i}`, [['Toán', t]]])));

  it('brings in only teachers who are used, and counts the rest', () => {
    const { file, summary } = run(
      workbook(
        used('Cô Lan'),
        teachersSheet([
          ['Trần Thị Lan', 'Cô Lan', '', '', 'THCS', ''],
          ['Lê Văn Bình', 'Thầy Bình', '', '', 'THPT', ''],
          ['Ngô Thị Cúc', 'Cô Cúc', '', '', 'THPT', ''],
        ]),
      ),
    );
    expect(file.teachers).toEqual([
      {
        id: expect.any(String),
        shortName: 'Cô Lan',
        fullName: 'Trần Thị Lan',
        school: 'THCS',
        conditions: [],
      },
    ]);
    expect(summary.teachersNotUsed).toBe(2);
  });

  it('keeps the teachers sheet’s order', () => {
    const { file } = run(
      workbook(
        used('Thầy Bình', 'Cô Lan'),
        teachersSheet([
          ['', 'Cô Lan', '', '', '', ''],
          ['', 'Thầy Bình', '', '', '', ''],
        ]),
      ),
    );
    expect(shortNames(file.teachers)).toEqual(['Cô Lan', 'Thầy Bình']);
  });

  it('brings in a teacher missing from the teachers sheet with only a short name', () => {
    const { file, problems } = run(
      workbook(
        used('Cô Lan', 'Cô Tưởng Tượng'),
        teachersSheet([['Trần Thị Lan', 'Cô Lan', '', '', '', '']]),
      ),
    );
    expect(byShortName(file, 'Cô Tưởng Tượng')).toEqual({
      id: expect.any(String),
      shortName: 'Cô Tưởng Tượng',
      conditions: [],
    });
    expect(said(problems)).toEqual([
      "HK1 F5: Cô Tưởng Tượng isn't in ID GV 1S, so they come in with only their short name.",
    ]);
  });

  it('names a missing teacher once, at the first cell', () => {
    const { problems } = run(
      workbook(
        used('Cô Tưởng Tượng', 'Cô Tưởng Tượng'),
        teachersSheet([['', 'Cô Lan', '', '', '', '']]),
      ),
    );
    expect(problems).toHaveLength(1);
  });

  it('says nothing about missing teachers when no teachers sheet is chosen', () => {
    const { file, problems } = run(workbook(used('Cô Tưởng Tượng')));
    expect(shortNames(file.teachers)).toEqual(['Cô Tưởng Tượng']);
    expect(problems).toEqual([]);
  });

  it('matches a short name ignoring case', () => {
    const { file, problems } = run(
      workbook(used('cô lan'), teachersSheet([['Trần Thị Lan', 'Cô Lan', '', '', '', '']])),
    );
    expect(file.teachers).toHaveLength(1);
    expect(file.teachers[0]).toMatchObject({ shortName: 'Cô Lan', fullName: 'Trần Thị Lan' });
    expect(problems).toEqual([]);
  });

  it('leaves out an email or phone that isn’t one', () => {
    const { file, problems } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '12', 'lan.school', '', '']])),
    );
    expect(file.teachers[0]).toEqual({
      id: expect.any(String),
      shortName: 'Cô Lan',
      conditions: [],
    });
    expect(said(problems)).toEqual([
      "ID GV 1S D3: 12 isn't a phone number, so it's left out.",
      "ID GV 1S E3: lan.school isn't an email, so it's left out.",
    ]);
  });

  it('says nothing about the details of a teacher who isn’t used', () => {
    const { problems } = run(
      workbook(
        used('Cô Lan'),
        teachersSheet([
          ['', 'Cô Lan', '', '', '', ''],
          ['', 'Thầy Bình', '12', 'nope', '', ''],
        ]),
      ),
    );
    expect(problems).toEqual([]);
  });

  it('gives a phone saved as a 9-digit number its leading 0 back', () => {
    const { file } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '912345678', '', '', '']])),
    );
    expect(file.teachers[0]?.phone).toBe('0912345678');
  });

  it('keeps a phone typed with its spaces', () => {
    const { file } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '0912 345 678', '', '', '']])),
    );
    expect(file.teachers[0]?.phone).toBe('0912 345 678');
  });

  it.each([
    ['THCS', '', 'THCS'],
    ['THPT', '', 'THPT'],
    ['THCS', 'THPT', 'both'],
    ['THPT', 'THCS', 'both'],
    ['THCS', 'THCS', 'THCS'],
    ['thcs', '', 'THCS'],
    ['THCS, THPT', '', 'both'],
  ])('reads home school %s, also at %s, as %s', (home, also, expected) => {
    const { file } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '', '', home, also]])),
    );
    expect(file.teachers[0]?.school).toBe(expected);
  });

  it('leaves the home school out when no column names one', () => {
    const { file, problems } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '', '', '', 'THPT']])),
    );
    expect(file.teachers[0]?.school).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it('says what it does with a home school it can’t read', () => {
    const { file, problems } = run(
      workbook(used('Cô Lan'), teachersSheet([['', 'Cô Lan', '', '', 'Cấp 2', '']])),
    );
    expect(file.teachers[0]?.school).toBeUndefined();
    expect(said(problems)).toEqual(["ID GV 1S F3: Cấp 2 isn't THCS or THPT, so it's left out."]);
  });

  it('takes the first row of a short name used twice, naming both rows', () => {
    const { file, problems } = run(
      workbook(
        used('Cô Lan'),
        teachersSheet([
          ['Trần Thị Lan', 'Cô Lan', '', '', '', ''],
          ['Hoàng Thị Lan', 'cô lan', '', '', '', ''],
        ]),
      ),
    );
    expect(file.teachers).toHaveLength(1);
    expect(file.teachers[0]?.fullName).toBe('Trần Thị Lan');
    expect(said(problems)).toEqual([
      'ID GV 1S C4: Cô Lan is on rows 3 and 4, so the first row is used and this one is left out.',
    ]);
  });

  it('says when a row with details has no short name, and passes over a blank one', () => {
    const { problems } = run(
      workbook(
        used('Cô Lan'),
        teachersSheet([
          ['', 'Cô Lan', '', '', '', ''],
          ['Lê Văn Bình', '', '', '', '', ''],
          ['', '', '', '', '', ''],
        ]),
      ),
    );
    expect(said(problems)).toEqual(["ID GV 1S C4: This row has no short name, so it's left out."]);
  });

  it('leaves out a teachers sheet with no short name column, and says so', () => {
    const { file, problems } = run(
      workbook(used('Cô Lan'), teachersSheet([['Trần Thị Lan', 'Cô Lan', '', '', '', '']])),
      undefined,
      (c) => {
        c.teachers.columns.shortName = null;
      },
    );
    expect(file.teachers).toEqual([
      { id: expect.any(String), shortName: 'Cô Lan', conditions: [] },
    ]);
    expect(said(problems)).toEqual([
      'ID GV 1S : No column is chosen for the short name, so this sheet is left out.',
    ]);
  });

  it('leaves a field that’s not imported empty', () => {
    const { file } = run(
      workbook(used('Cô Lan'), teachersSheet([['Trần Thị Lan', 'Cô Lan', '', 'a@b.c', '', '']])),
      undefined,
      (c) => {
        c.teachers.columns.email = null;
      },
    );
    expect(file.teachers[0]).toMatchObject({ fullName: 'Trần Thị Lan' });
    expect(file.teachers[0]?.email).toBeUndefined();
  });
});

describe('classes', () => {
  const TEACHERS = teachersSheet([
    ['Trần Thị Lan', 'Cô Lan', '', '', '', ''],
    ['Lê Văn Bình', 'Thầy Bình', '', '', '', ''],
  ]);

  it('takes homeroom teachers and assistants by short or full name, ignoring case', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1', '6A2']),
        TEACHERS,
        classesSheet([
          ['6A1', 'trần thị lan', 'Thầy Bình'],
          ['6A2', 'Cô Lan', ''],
        ]),
      ),
    );
    const lan = byShortName(file, 'Cô Lan')!;
    const binh = byShortName(file, 'Thầy Bình')!;
    expect(file.classes).toMatchObject([
      {
        name: '6A1',
        grade: 6,
        track: 'A',
        section: 1,
        formTeacherId: lan.id,
        coTeacherId: binh.id,
      },
      { name: '6A2', formTeacherId: lan.id },
    ]);
    expect(file.classes[1]?.coTeacherId).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it('says when a full name fits more than one teacher, and uses the first', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1']),
        teachersSheet([
          ['Trần Thị Lan', 'Cô Lan', '', '', '', ''],
          ['Trần Thị Lan', 'Cô Lan B', '', '', '', ''],
        ]),
        classesSheet([['6A1', 'Trần Thị Lan', '']]),
      ),
    );
    expect(file.classes[0]?.formTeacherId).toBe(byShortName(file, 'Cô Lan')?.id);
    expect(said(problems)).toEqual([
      'Data  B2: More than one teacher is called Trần Thị Lan (Cô Lan and Cô Lan B), so Cô Lan is used.',
    ]);
  });

  describe('telling apart teachers with the same name (R5-3 review)', () => {
    const HEADS = [
      'Lớp',
      'GVCN/Form Teacher:',
      'PCN/Co-teacher',
      'Mob CN',
      'Mob PCN',
      'Email CN',
      'Email PCN',
    ];
    const data = (rows: string[][]) => sheet('Data ', [HEADS, ...rows]);
    const twoLans = teachersSheet([
      ['Trần Thị Lan', 'Cô Lan', '0912 000 101', 'lan.a@school.example', '', ''],
      ['Trần Thị Lan', 'Cô Lan B', '0912 000 102', 'lan.b@school.example', '', ''],
    ]);
    const homeroomOf = (rows: string[][], teachers = twoLans) => {
      const { file, problems } = run(workbook(grid(['6A1']), teachers, data(rows)));
      return {
        teacher: file.teachers.find((t) => t.id === file.classes[0]?.formTeacherId),
        problems,
      };
    };

    it('uses the same row’s email', () => {
      const { teacher, problems } = homeroomOf([
        ['6A1', 'Trần Thị Lan', '', '', '', 'LAN.B@school.example', ''],
      ]);
      expect(teacher?.shortName).toBe('Cô Lan B');
      expect(problems).toEqual([]);
    });

    it('uses the same row’s phone, spaces and a lost leading 0 aside', () => {
      const { teacher, problems } = homeroomOf([
        ['6A1', 'Trần Thị Lan', '', '912000102', '', '', ''],
      ]);
      expect(teacher?.shortName).toBe('Cô Lan B');
      expect(problems).toEqual([]);
    });

    it('uses the assistant’s own columns for the assistant', () => {
      const { file, problems } = run(
        workbook(
          grid(['6A1']),
          twoLans,
          data([
            [
              '6A1',
              'Trần Thị Lan',
              'Trần Thị Lan',
              '',
              '',
              'lan.a@school.example',
              'lan.b@school.example',
            ],
          ]),
        ),
      );
      expect(file.classes[0]?.formTeacherId).toBe(byShortName(file, 'Cô Lan')?.id);
      expect(file.classes[0]?.coTeacherId).toBe(byShortName(file, 'Cô Lan B')?.id);
      expect(problems).toEqual([]);
    });

    it('still uses the first and says so when the email and phone fit neither', () => {
      const { teacher, problems } = homeroomOf([
        ['6A1', 'Trần Thị Lan', '', '0999 999 999', '', 'someone@school.example', ''],
      ]);
      expect(teacher?.shortName).toBe('Cô Lan');
      expect(said(problems)).toEqual([
        'Data  B2: More than one teacher is called Trần Thị Lan (Cô Lan and Cô Lan B), so Cô Lan is used.',
      ]);
    });

    it('does not count an empty cell as fitting a teacher with no email', () => {
      const { teacher, problems } = homeroomOf(
        [['6A1', 'Trần Thị Lan', '', '', '', '', '']],
        teachersSheet([
          ['Trần Thị Lan', 'Cô Lan', '', 'lan.a@school.example', '', ''],
          ['Trần Thị Lan', 'Cô Lan B', '', '', '', ''],
        ]),
      );
      expect(teacher?.shortName).toBe('Cô Lan');
      expect(problems).toHaveLength(1);
    });

    const shortAndFull = teachersSheet([
      ['Nguyễn Văn An', 'An', '', 'an.short@school.example', '', ''],
      ['An', 'Thầy Bình', '', 'binh@school.example', '', ''],
    ]);

    it('finds a full name that is also another teacher’s short name by its email', () => {
      const { teacher, problems } = homeroomOf(
        [['6A1', 'An', '', '', '', 'binh@school.example', '']],
        shortAndFull,
      );
      expect(teacher?.shortName).toBe('Thầy Bình');
      expect(problems).toEqual([]);
    });

    it('prefers the short name and says so when nothing tells them apart', () => {
      const { teacher, problems } = homeroomOf([['6A1', 'An', '', '', '', '', '']], shortAndFull);
      expect(teacher?.shortName).toBe('An');
      expect(said(problems)).toEqual([
        'Data  B2: More than one teacher is called An (An and Thầy Bình), so An is used.',
      ]);
    });

    it('uses the open timetable’s teachers’ details too', () => {
      const into: TimetableFile = {
        ...createEmptyTimetable(),
        teachers: [
          {
            id: 't-a',
            shortName: 'Cô Lan',
            fullName: 'Trần Thị Lan',
            email: 'a@school.example',
            conditions: [],
          },
          {
            id: 't-b',
            shortName: 'Cô Lan B',
            fullName: 'Trần Thị Lan',
            email: 'b@school.example',
            conditions: [],
          },
        ],
      };
      const book = workbook(
        grid(['6A1']),
        data([['6A1', 'Trần Thị Lan', '', '', '', 'b@school.example', '']]),
      );
      const { file, problems } = importTimetable(book, suggestImport(book), into);
      expect(file.classes[0]?.formTeacherId).toBe('t-b');
      expect(problems).toEqual([]);
    });
  });

  it('finds a teacher by the full name on a repeated short name’s row', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1']),
        teachersSheet([
          ['Trần Thị Lan', 'Cô Lan', '', '', '', ''],
          ['Hoàng Thị Lan', 'Cô Lan', '', '', '', ''],
        ]),
        classesSheet([['6A1', 'Hoàng Thị Lan', '']]),
      ),
    );
    expect(shortNames(file.teachers)).toEqual(['Cô Lan']);
    expect(file.classes[0]?.formTeacherId).toBe(file.teachers[0]?.id);
    expect(said(problems)).toEqual([
      'ID GV 1S C4: Cô Lan is on rows 3 and 4, so the first row is used and this one is left out.',
    ]);
  });

  it('leaves out a classes sheet with no class column, and says so', () => {
    const { file, problems } = run(
      workbook(grid(['6A1']), classesSheet([['6A2', 'Cô Lan', '']])),
      undefined,
      (c) => {
        c.classes.columns.className = null;
      },
    );
    expect(names(file.classes)).toEqual(['6A1']);
    expect(said(problems)).toEqual([
      'Data  : No column is chosen for the class, so this sheet is left out.',
    ]);
  });

  it('brings in a homeroom teacher nobody can match with only a short name', () => {
    const { file, problems } = run(
      workbook(grid(['6A1']), TEACHERS, classesSheet([['6A1', 'Phan Thu Hà', '']])),
    );
    expect(file.classes[0]?.formTeacherId).toBe(byShortName(file, 'Phan Thu Hà')?.id);
    expect(said(problems)).toEqual([
      "Data  B2: Phan Thu Hà isn't in ID GV 1S, so they come in with only their short name.",
    ]);
  });

  it('counts homeroom teachers and assistants as used', () => {
    const { file, summary } = run(
      workbook(grid(['6A1']), TEACHERS, classesSheet([['6A1', 'Cô Lan', '']])),
    );
    expect(shortNames(file.teachers)).toEqual(['Cô Lan']);
    expect(summary.teachersNotUsed).toBe(1);
  });

  it('leaves out a row with a bad class name', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1']),
        TEACHERS,
        classesSheet([
          ['6A1', 'Cô Lan', ''],
          ['6Z1', 'Thầy Bình', ''],
        ]),
      ),
    );
    expect(names(file.classes)).toEqual(['6A1']);
    expect(shortNames(file.teachers)).toEqual(['Cô Lan']);
    expect(said(problems)).toEqual(["Data  A3: 6Z1 isn't a class name, so the row is left out."]);
  });

  it('uses the first row of a class listed twice', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1']),
        TEACHERS,
        classesSheet([
          ['6A1', 'Cô Lan', ''],
          ['6A1', 'Thầy Bình', ''],
        ]),
      ),
    );
    expect(file.classes[0]?.formTeacherId).toBe(byShortName(file, 'Cô Lan')?.id);
    expect(said(problems)).toEqual([
      'Data  A3: 6A1 is on rows 2 and 3, so the first row is used and this one is left out.',
    ]);
  });

  it('brings in a class that’s only in the classes sheet with an empty grid', () => {
    const { file, summary } = run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán', 'T. Hoa']] }),
        TEACHERS,
        classesSheet([
          ['6A1', 'Cô Lan', ''],
          ['10A2', 'Cô Lan', ''],
        ]),
      ),
    );
    expect(names(file.classes)).toEqual(['6A1', '10A2']);
    expect(file.grades).toEqual([6, 10]);
    expect(file.placements).toHaveLength(1);
    expect(summary.classes.added).toBe(2);
  });

  it('says when a class has no homeroom teacher, and brings it in', () => {
    const { file, problems } = run(
      workbook(grid(['6A1', '6A2']), TEACHERS, classesSheet([['6A1', '', 'Cô Lan']])),
    );
    expect(names(file.classes)).toEqual(['6A1', '6A2']);
    expect(said(problems)).toEqual([
      'HK1 G1: 6A2 has no homeroom teacher, so it comes in without one.',
      'Data  B2: 6A1 has no homeroom teacher, so it comes in without one.',
    ]);
  });

  it('says nothing about homeroom teachers when they’re not imported', () => {
    expect(run(workbook(grid(['6A1']))).problems).toEqual([]);
    const { problems } = run(
      workbook(grid(['6A1']), TEACHERS, classesSheet([['6A1', '', '']])),
      undefined,
      (c) => {
        c.classes.columns.homeroom = null;
      },
    );
    expect(problems).toEqual([]);
  });
});

describe('the teacher from teaching assignments', () => {
  const ASSIGNMENTS = sheet('Phan cong', [
    [],
    ['TT', 'Lớp', 'Toán', 'Sinh hoạt lớp', 'SH lớp-GDPC/ Class meeting', 'Tiếng Anh', 'GVCN'],
    ['1', '6A1', 'Cô Lan', 'Cô Mai', 'Thầy Bình', '', 'Cô Lan'],
    ['2', '6Z1', 'Cô Lan'],
    ['3', '6A1', 'Thầy Bình'],
  ]);
  const fromAssignments = (c: ImportChoices) => {
    c.teacherFrom = 'assignments';
    // With no `Data `, a sheet naming classes and a GVCN column looks like a classes list.
    c.classes.sheet = null;
  };

  it('looks up the class’s row under the subject’s column, not the row under', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán', 'Ignored']] }), ASSIGNMENTS),
      undefined,
      fromAssignments,
    );
    expect(placements(file)).toEqual(['6A1 0 0 full Toán Cô Lan']);
  });

  it.each([
    ['the row under each subject', (c: ImportChoices) => void (c.classes.sheet = null)],
    ['teaching assignments', fromAssignments],
  ])(
    'ignores a room column, so the cards come with no room, with teachers from %s (IE-1)',
    (_source, change) => {
      const withRooms = sheet('Phan cong', [
        [],
        ['TT', 'Lớp', 'Toán', 'Phòng/ Room'],
        ['1', '6A1', 'Cô Lan', 'P101'],
      ]);
      const { file } = run(
        workbook(grid(['6A1'], { '0-0': [['Toán', 'Cô Lan']] }), withRooms),
        undefined,
        change,
      );
      expect(placements(file)).toEqual(['6A1 0 0 full Toán Cô Lan']);
      expect(file.rooms).toEqual([]);
      expect(file.cards.map((c) => c.roomId)).toEqual([null]);
    },
  );

  it('looks up two halves one by one', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán + Sinh hoạt lớp']] }), ASSIGNMENTS),
      undefined,
      fromAssignments,
    );
    expect(placements(file)).toEqual([
      '6A1 0 0 first Toán Cô Lan',
      '6A1 0 0 second Sinh hoạt lớp Cô Mai',
    ]);
  });

  it('looks a joined subject’s second half up under the cell’s own name', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['SH lớp-GDPC/ Class meeting']] }), ASSIGNMENTS),
      undefined,
      fromAssignments,
    );
    expect(placements(file)).toEqual([
      '6A1 0 0 first Sinh hoạt lớp Cô Mai',
      '6A1 0 0 second Giáo dục phẩm chất Thầy Bình',
    ]);
  });

  it('says once per class and subject when there’s no teacher for it', () => {
    const { file, problems } = run(
      workbook(
        grid(['6A1'], {
          '0-0': [['Tiếng Anh']],
          '0-1': [['Tiếng Anh']],
          '0-2': [['Tin học']],
        }),
        ASSIGNMENTS,
      ),
      undefined,
      fromAssignments,
    );
    expect(placements(file)).toEqual([
      '6A1 0 0 full Tiếng Anh -',
      '6A1 0 1 full Tiếng Anh -',
      '6A1 0 2 full Tin học -',
    ]);
    expect(said(problems)).toContain(
      'HK1 F2: Phan cong has no teacher for Tiếng Anh in 6A1, so the card has no teacher.',
    );
    expect(said(problems)).toContain(
      'HK1 F6: Phan cong has no teacher for Tin học in 6A1, so the card has no teacher.',
    );
  });

  it('checks the sheet’s class names, and uses the first row of a repeat', () => {
    const { problems } = run(workbook(grid(['6A1']), ASSIGNMENTS), undefined, fromAssignments);
    expect(said(problems)).toEqual([
      "Phan cong B4: 6Z1 isn't a class name, so the row is left out.",
      'Phan cong B5: 6A1 is on rows 3 and 5, so the first row is used and this one is left out.',
    ]);
  });

  it('names the assignments cell when its teacher isn’t in the teachers sheet', () => {
    const { problems } = run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán']] }),
        ASSIGNMENTS,
        teachersSheet([['', 'Thầy Bình', '', '', '', '']]),
      ),
      undefined,
      fromAssignments,
    );
    expect(said(problems)).toContain(
      "Phan cong C3: Cô Lan isn't in ID GV 1S, so they come in with only their short name.",
    );
  });

  it('uses the row under when no teaching assignments sheet is chosen', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán', 'T. Hoa']] })),
      undefined,
      fromAssignments,
    );
    expect(placements(file)).toEqual(['6A1 0 0 full Toán T. Hoa']);
  });
});

describe('importing into the open profile', () => {
  function openProfile(): TimetableFile {
    return {
      ...createEmptyTimetable(),
      grades: [6, 7],
      subjects: [
        { id: 'toan', name: 'Toán', colorKey: 'art', colorSource: 'palette' },
        { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
      ],
      teachers: [
        {
          id: 'lan',
          shortName: 'Cô Lan',
          fullName: 'Trần Thị Lan',
          email: 'lan@school.example',
          phone: '0912 000 111',
          school: 'THCS',
          conditions: [{ id: 'c1', on: true, type: 'maxPeriodsPerDay', max: 4 }],
        },
        { id: 'binh', shortName: 'Thầy Bình', conditions: [] },
      ],
      rooms: [
        { id: 'p1', name: 'P101' },
        { id: 'p2', name: 'P102' },
      ],
      classes: [
        { id: 'a1', name: '6A1', grade: 6, track: 'A', section: 1, formTeacherId: 'binh' },
        { id: 'b1', name: '7B1', grade: 7, track: 'B', section: 1 },
      ],
      cards: [
        { id: 'k-toan-lan', subjectId: 'toan', teacherId: 'lan', roomId: 'p1' },
        { id: 'k-van-1', subjectId: 'van', teacherId: 'lan', roomId: 'p1' },
        { id: 'k-van-2', subjectId: 'van', teacherId: 'lan', roomId: 'p2' },
        { id: 'k-van-binh-1', subjectId: 'van', teacherId: 'binh', roomId: 'p1' },
        { id: 'k-van-binh-2', subjectId: 'van', teacherId: 'binh', roomId: null },
      ],
      placements: [
        { id: 'old-a', cardId: 'k-van-1', classId: 'a1', day: 4, block: 4, part: 'full' },
        { id: 'old-b', cardId: 'k-van-2', classId: 'b1', day: 0, block: 0, part: 'full' },
      ],
    };
  }

  it('updates a teacher from the cells with a value, keeping conditions', () => {
    const { file, summary } = run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán', 'cô lan']] }),
        teachersSheet([['', 'Cô Lan', '0987 654 321', '', 'THPT', '']]),
      ),
      openProfile(),
    );
    expect(file.teachers.find((t) => t.id === 'lan')).toEqual({
      id: 'lan',
      shortName: 'Cô Lan',
      fullName: 'Trần Thị Lan',
      email: 'lan@school.example',
      phone: '0987 654 321',
      school: 'THPT',
      conditions: [{ id: 'c1', on: true, type: 'maxPeriodsPerDay', max: 4 }],
    });
    expect(summary.teachers).toEqual({ added: 0, updated: 1 });
  });

  it('keeps what’s there for a bad cell or a field left at Not imported', () => {
    const { file } = run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán', 'Cô Lan']] }),
        teachersSheet([['Tên Khác', 'Cô Lan', 'x', '', '', '']]),
      ),
      openProfile(),
      (c) => {
        c.teachers.columns.fullName = null;
      },
    );
    expect(byShortName(file, 'Cô Lan')).toMatchObject({
      fullName: 'Trần Thị Lan',
      phone: '0912 000 111',
    });
  });

  it('finds a teacher already there without the teachers sheet saying so', () => {
    const { file, problems, summary } = run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán', 'Thầy Bình']] }),
        teachersSheet([['', 'Cô Mai', '', '', '', '']]),
      ),
      openProfile(),
    );
    expect(file.teachers).toHaveLength(2);
    expect(problems.filter((p) => p.message.includes("isn't in"))).toEqual([]);
    expect(summary.teachers).toEqual({ added: 0, updated: 1 });
  });

  it('matches a homeroom teacher against the profile’s teachers by full name', () => {
    const { file } = run(
      workbook(grid(['6A1']), classesSheet([['6A1', 'Trần Thị Lan', '']])),
      openProfile(),
    );
    expect(file.classes[0]?.formTeacherId).toBe('lan');
  });

  it('keeps a class’s homeroom teacher when its cell is empty', () => {
    const { file, problems } = run(
      workbook(grid(['6A1']), classesSheet([['6A1', '', 'Cô Lan']])),
      openProfile(),
    );
    expect(file.classes[0]).toMatchObject({ formTeacherId: 'binh', coTeacherId: 'lan' });
    expect(problems).toEqual([]);
  });

  it('replaces only the imported classes’ grids, and deletes nothing', () => {
    const into = openProfile();
    const { file, summary } = run(
      workbook(grid(['6A1', '6A2'], { '0-1': [['Toán', 'Cô Lan']] })),
      into,
    );
    expect(placements(file)).toEqual(['6A1 0 1 full Toán Cô Lan', '7B1 0 0 full Ngữ văn Cô Lan']);
    expect(names(file.classes)).toEqual(['6A1', '7B1', '6A2']);
    expect(file.cards.map((c) => c.id)).toEqual(
      expect.arrayContaining(into.cards.map((c) => c.id)),
    );
    expect(file.teachers.map((t) => t.id)).toEqual(['lan', 'binh']);
    expect(file.subjects.map((s) => s.id)).toEqual(['toan', 'van']);
    expect(file.rooms).toEqual(into.rooms);
    expect(summary).toMatchObject({
      classes: { added: 1, updated: 1 },
      gridsReplaced: 1,
      placements: 1,
    });
  });

  it('keeps the grid of a class only the classes sheet names', () => {
    const { file } = run(
      workbook(grid(['6A1']), classesSheet([['7B1', 'Cô Lan', '']])),
      openProfile(),
    );
    expect(placements(file)).toContain('7B1 0 0 full Ngữ văn Cô Lan');
    expect(file.classes.find((c) => c.id === 'b1')?.formTeacherId).toBe('lan');
  });

  it('keeps a subject’s colors and spelling, matching without case but with accents', () => {
    const { file, summary } = run(
      workbook(grid(['6A1'], { '0-0': [['toán', 'Cô Lan']], '0-1': [['Toan', 'Cô Lan']] })),
      openProfile(),
    );
    expect(file.subjects[0]).toEqual({
      id: 'toan',
      name: 'Toán',
      colorKey: 'art',
      colorSource: 'palette',
    });
    expect(names(file.subjects)).toEqual(['Toán', 'Ngữ văn', 'Toan']);
    expect(summary.subjects).toEqual({ added: 1, updated: 1 });
  });

  it('uses a subject and teacher’s one card, so its room is kept', () => {
    const { file, summary } = run(
      workbook(grid(['6A1'], { '0-0': [['Toán', 'Cô Lan']] })),
      openProfile(),
    );
    expect(file.placements.find((p) => p.classId === 'a1')?.cardId).toBe('k-toan-lan');
    expect(summary.cards).toEqual({ added: 0, updated: 1 });
  });

  it('makes a card with no room when the teacher has several for the subject', () => {
    const into = openProfile();
    const { file, summary } = run(
      workbook(grid(['6A1'], { '0-0': [['Ngữ văn', 'Cô Lan']] })),
      into,
    );
    const placed = file.cards.find(
      (c) => c.id === file.placements.find((p) => p.classId === 'a1')?.cardId,
    );
    expect(placed).toMatchObject({ subjectId: 'van', teacherId: 'lan', roomId: null });
    expect(into.cards).not.toContainEqual(placed);
    expect(summary.cards).toEqual({ added: 1, updated: 0 });
  });

  it('uses the card with no room among several', () => {
    const { file } = run(
      workbook(grid(['6A1'], { '0-0': [['Ngữ văn', 'Thầy Bình']] })),
      openProfile(),
    );
    expect(file.placements.find((p) => p.classId === 'a1')?.cardId).toBe('k-van-binh-2');
  });

  it('adds the grades its classes need, in order', () => {
    const { file } = run(workbook(grid(['9A1', '10B1'])), openProfile());
    expect(file.grades).toEqual([6, 7, 9, 10]);
  });

  it('doesn’t change the file it was given', () => {
    const into = openProfile();
    const copy = structuredClone(into);
    run(
      workbook(
        grid(['6A1'], { '0-0': [['Toán', 'Cô Lan']] }),
        teachersSheet([['Tên Khác', 'Cô Lan', '', '', '', '']]),
      ),
      into,
    );
    expect(into).toEqual(copy);
  });
});

describe('the problems', () => {
  it('are listed by sheet in workbook order, then by row, then by column', () => {
    const { problems } = run(
      workbook(
        teachersSheet([['', 'Cô Lan', '12', 'x', '', '']]),
        classesSheet([
          ['6Z2', '', ''],
          ['6A1', 'Cô Lan', ''],
          ['6Z1', '', ''],
        ]),
        grid(['6A1'], { '0-0': [['Toán', 'Cô Lan']], '0-1': [['Toán', 'Cô Tưởng Tượng']] }),
      ),
    );
    expect(problems.map((p) => [p.sheet, p.cell])).toEqual([
      ['ID GV 1S', 'D3'],
      ['ID GV 1S', 'E3'],
      ['Data ', 'A2'],
      ['Data ', 'A4'],
      ['HK1', 'F5'],
    ]);
  });
});

describe('the reference workbook', () => {
  it('gives the sample school, with no rooms', () => {
    const data = referenceWorkbookData();
    const choices = suggestImport(data);
    const { file, summary, problems } = importTimetable(data, choices, createEmptyTimetable());
    expect(fileProblem(file)).toBeNull();

    expect(names(file.classes)).toEqual(names(exampleSchool.classes));
    expect(file.grades).toEqual(exampleSchool.grades);
    expect(placements(file)).toEqual(placements(exampleSchool));
    expect(names(file.subjects).sort()).toEqual(names(exampleSchool.subjects).sort());
    expect(file.rooms).toEqual([]);
    expect(file.cards.every((c) => c.roomId === null)).toBe(true);

    const detail = (f: TimetableFile) =>
      f.teachers.map(({ shortName, fullName, email, phone, school }) => ({
        shortName,
        fullName,
        email,
        // The saved number lost its spaces with its leading 0.
        phone: phone?.replace('0912 345 678', '0912345678'),
        school,
      }));
    expect(detail(file)).toEqual(detail(exampleSchool));

    const homeroom = (f: TimetableFile) =>
      f.classes.map((c) => [
        f.teachers.find((t) => t.id === c.formTeacherId)?.shortName,
        f.teachers.find((t) => t.id === c.coTeacherId)?.shortName,
      ]);
    expect(homeroom(file)).toEqual(homeroom(exampleSchool));

    expect(summary).toMatchObject({
      teachers: { added: 8, updated: 0 },
      classes: { added: 6, updated: 0 },
      subjects: { added: 10, updated: 0 },
      placements: exampleSchool.placements.length,
      cardsWithoutTeacher: 1,
      teachersNotUsed: 1,
      gridsReplaced: 0,
      bellTimesDiffer: false,
    });
    expect(said(problems)).toEqual([
      'Data  I12: 9BA1 has no homeroom teacher, so it comes in without one.',
    ]);
  });
});

describe('what the Import screen shows of a result', () => {
  const summary: ImportSummary = {
    teachers: { added: 50, updated: 11 },
    classes: { added: 31, updated: 3 },
    subjects: { added: 31, updated: 0 },
    cards: { added: 412, updated: 0 },
    placements: 1236,
    cardsWithoutTeacher: 44,
    teachersNotUsed: 42,
    gridsReplaced: 3,
    bellTimesDiffer: false,
  };

  it('lists the totals, with what was left out beside them', () => {
    expect(importFoundRows(summary, false)).toEqual([
      { label: 'Classes', value: '34' },
      { label: 'Teachers', value: '61', note: '42 more not used' },
      { label: 'Subjects', value: '31' },
      { label: 'Cards', value: '412', note: '44 with no teacher' },
      { label: 'Placements', value: '1 236' },
    ]);
  });

  it('adds what is replaced and updated into the open profile', () => {
    expect(importFoundRows(summary, true).slice(5)).toEqual([
      { label: 'Grids replaced', value: '3' },
      { label: 'Updated', value: '11 teachers, 3 classes' },
    ]);
    const none = {
      ...summary,
      teachers: { added: 61, updated: 0 },
      classes: { added: 34, updated: 0 },
    };
    expect(importFoundRows(none, true).at(-1)?.value).toBe('None');
  });

  it('leaves out notes with nothing to say', () => {
    const rows = importFoundRows({ ...summary, teachersNotUsed: 0, cardsWithoutTeacher: 0 }, false);
    expect(rows.some((row) => row.note !== undefined)).toBe(false);
  });

  it('has something to import only when a class comes in', () => {
    expect(importsSomething(summary)).toBe(true);
    const updatedOnly = { ...summary, classes: { added: 0, updated: 2 } };
    expect(importsSomething(updatedOnly)).toBe(true);
    expect(importsSomething({ ...summary, classes: { added: 0, updated: 0 } })).toBe(false);
    const nothing = importTimetable(
      { fileName: 'x.xlsx', sheets: [] },
      { ...suggestImport({ fileName: 'x.xlsx', sheets: [] }) },
      createEmptyTimetable(),
    );
    expect(importsSomething(nothing.summary)).toBe(false);
  });

  it('says when the block times differ', () => {
    expect(bellTimesNote(summary)).toBeNull();
    expect(bellTimesNote({ ...summary, bellTimesDiffer: true })).toBe(
      "The sheet's block times aren't this timetable's, which stay as they are.",
    );
  });

  it('shows the first 200 problems and counts the rest', () => {
    const problem = (n: number): ImportProblem => ({ sheet: 'HK1', cell: `F${n}`, message: '' });
    const many = Array.from({ length: 203 }, (_, n) => problem(n));
    expect(shownProblems(many).shown).toHaveLength(200);
    expect(shownProblems(many).shown[199]).toBe(many[199]);
    expect(shownProblems(many).more).toBe(3);
    expect(shownProblems(many.slice(0, 5))).toEqual({ shown: many.slice(0, 5), more: 0 });
  });

  it('places a problem by its sheet and cell, trimmed, or nowhere', () => {
    expect(problemPlace({ sheet: 'Data ', cell: 'H14', message: '' })).toBe('Data H14');
    expect(problemPlace({ sheet: 'HK1', cell: '', message: '' })).toBe('HK1');
    expect(problemPlace({ sheet: '', cell: '', message: '' })).toBe('');
  });

  it('asks before importing into the open profile, saying what is replaced and updated', () => {
    expect(importQuestion(summary, 'Timetable')).toEqual({
      title: 'Import into Timetable?',
      lines: [
        'The grids of 3 classes are replaced, and 11 teachers and 3 classes are updated.',
        "A copy of the timetable as it is now is kept in the profile's folder.",
      ],
    });
    const one = {
      ...summary,
      gridsReplaced: 1,
      teachers: { added: 0, updated: 1 },
      classes: { added: 0, updated: 0 },
    };
    expect(importQuestion(one, 'T').lines[0]).toBe(
      'The grid of 1 class is replaced, and 1 teacher is updated.',
    );
    const updatedOnly = { ...one, gridsReplaced: 0, classes: { added: 0, updated: 1 } };
    expect(importQuestion(updatedOnly, 'T').lines[0]).toBe('1 teacher and 1 class are updated.');
    expect(importQuestion({ ...summary, teachers: { added: 1, updated: 0 } }, 'T').lines[0]).toBe(
      'The grids of 3 classes are replaced, and 3 classes are updated.',
    );
    const allNew = {
      ...summary,
      gridsReplaced: 0,
      teachers: { added: 61, updated: 0 },
      classes: { added: 34, updated: 0 },
    };
    expect(importQuestion(allNew, 'Term 2').lines[0]).toBe(
      'Nothing already in Term 2 is replaced or updated.',
    );
  });

  it('says what came in, counting what was added and updated', () => {
    expect(importNoticeText(summary, 'Timetable')).toBe(
      'Imported 34 classes, 61 teachers, and 412 cards into Timetable.',
    );
    const one = {
      ...summary,
      classes: { added: 1, updated: 0 },
      teachers: { added: 0, updated: 1 },
      cards: { added: 1, updated: 0 },
    };
    expect(importNoticeText(one, 'TKB')).toBe('Imported 1 class, 1 teacher, and 1 card into TKB.');
  });
});
