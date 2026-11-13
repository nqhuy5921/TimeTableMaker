import { describe, expect, it } from 'vitest';
import {
  blockFromCode,
  chooseColumn,
  chooseHeaderRow,
  chooseListSheet,
  columnOptions,
  dayFromText,
  findHeaderRow,
  firstValues,
  headerColumns,
  headerField,
  importProfileName,
  matchKey,
  readTimetableLayout,
  requiredColumnMessage,
  sameChoices,
  sheetOptions,
  suggestImport,
  timetableFound,
  type WorkbookData,
  type WorkbookSheet,
} from '../../src/domain/importWorkbook';

// IE-1's suggestions (SYSTEM_DESIGN §12.2–12.3): which sheet holds each kind of data, which
// row heads a list, which column holds each field, and where a timetable sheet's classes and
// blocks are. The sheets here copy the shapes of the school's workbook and the app's export,
// with made-up names.

const sheet = (name: string, rows: string[][], hidden = false): WorkbookSheet => ({
  name,
  hidden,
  rows,
});

// `ID GV 1S`: a title row, then the header with two `HỌ TÊN` columns, full name first.
const SCHOOL_TEACHERS = sheet('ID GV 1S', [
  [],
  [
    'TT',
    'HỌ TÊN',
    'HỌ TÊN',
    'ĐIỆN THOẠI',
    'EMAIL',
    'TRƯỜNG DẠY CHÍNH',
    'TRƯỜNG KIÊM NHIỆM',
    'VAI TRÒ/CHỨC VỤ',
  ],
  ['1', 'Trần Thị Lan', 'Cô Lan', '912000101', 'lan.tran@school.example', 'THCS', '', 'Giáo viên'],
]);

// `Data `: the header at H6, under a few rows of numbers.
const SCHOOL_DATA = sheet('Data ', [
  [''],
  [],
  [],
  [],
  ['', '', '', '', '', '', '', '1', '2', '3', '4', '5'],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Lớp',
    'GVCN/Form Teacher:',
    'PCN/Co-teacher',
    'Mob CN',
    'Mob PCN',
    'Email CN',
    'Email PCN',
  ],
  ['', '', '', '', '', '', '', '6A1', 'Trần Thị Lan', 'Lê Văn Phúc'],
]);

// `Phan cong`: a title, then a row per class and a column per subject.
const SCHOOL_ASSIGNMENTS = sheet('Phan cong', [
  ['PHÂN CÔNG GIẢNG DẠY CÁC LỚP'],
  [
    '',
    'Class',
    'GVCN/ Form teacher',
    'Phó chủ nhiệm/Co-Teacher',
    'Toán Bộ giáo dục/ Maths',
    'SH lớp-GDPC/ Class meeting',
  ],
  ['1', '6A1', 'Cô Lan', 'Thầy Phúc', 'Cô Lan', 'Cô Lan'],
]);

const HEAD = ['Thứ\nDay', '', '', 'Tiết\nPeriod', 'Thời gian\nTime'];

/** `HK1`'s shape: the class names, then "Tiết" and the same names again over counting
    columns; per day a fixed row, then each block's subject row and teacher row. */
function schoolGrid(days = ['Th2', 'Th3']): WorkbookSheet {
  const rows: string[][] = [
    [...HEAD, '6A1', '6A2', 'Tiết', '6A1', '6A2'],
    ['', '', '', '', '', '2', '3'],
  ];
  for (const code of days) {
    const name = code === 'Th2' ? 'Thứ Hai / Monday' : 'Thứ Ba / Tuesday';
    rows.push([
      name,
      code,
      `T${code.slice(2)}`,
      '',
      '7:00 - 7:45',
      'Ăn sáng/ Breakfast',
      'Ăn sáng/ Breakfast',
    ]);
    for (const [period, time] of [
      ['THCS12', '8:00 - 9:10'],
      ['THCS34', '9:20 - 10:30'],
    ]) {
      rows.push([
        name,
        code,
        `T${code.slice(2)}`,
        period ?? '',
        time ?? '',
        'Toán',
        'Ngữ văn',
        '12',
        '2',
        '0',
      ]);
      rows.push([name, code, `T${code.slice(2)}`, '', '', 'Cô Lan', 'Thầy Phúc']);
    }
  }
  return sheet('HK1', rows);
}

const schoolWorkbook = (): WorkbookData => ({
  fileName: 'TKB.xlsx',
  sheets: [
    sheet('TIMETABLE', [['Giờ', 'Hoạt động']]),
    SCHOOL_DATA,
    sheet('TKB 1S', [['Thứ', 'Tiết', '6A1']], true),
    SCHOOL_ASSIGNMENTS,
    schoolGrid(),
    SCHOOL_TEACHERS,
  ],
});

describe('matchKey', () => {
  it('drops case, accents, and punctuation', () => {
    expect(matchKey('GVCN/Form Teacher:')).toBe('gvcn form teacher');
    expect(matchKey('  ID GV 1S ')).toBe('id gv 1s');
    expect(matchKey('Điện thoại/ Phone')).toBe('dien thoai phone');
  });
});

describe('headerField', () => {
  it("knows the example's teacher headers, one per column", () => {
    expect(headerField('teachers', 'Tên ngắn/ Short name')).toBe('shortName');
    expect(headerField('teachers', 'Họ tên/ Full name')).toBe('fullName');
    expect(headerField('teachers', 'Điện thoại/ Phone')).toBe('phone');
    expect(headerField('teachers', 'Email')).toBe('email');
    expect(headerField('teachers', 'Trường dạy chính/ Home school')).toBe('school');
    expect(headerField('teachers', 'Trường kiêm nhiệm/ Also teaches at')).toBe('alsoAt');
  });

  it("knows ID GV 1S's headers and leaves the rest alone", () => {
    expect(headerField('teachers', 'HỌ TÊN')).toBe('fullName');
    expect(headerField('teachers', 'ĐIỆN THOẠI')).toBe('phone');
    expect(headerField('teachers', 'TRƯỜNG DẠY CHÍNH')).toBe('school');
    expect(headerField('teachers', 'TRƯỜNG KIÊM NHIỆM')).toBe('alsoAt');
    expect(headerField('teachers', 'TT')).toBeNull();
    expect(headerField('teachers', 'VAI TRÒ/CHỨC VỤ')).toBeNull();
    expect(headerField('teachers', '')).toBeNull();
  });

  it('tells the homeroom teacher from the assistant in Data and Phan cong', () => {
    expect(headerField('classes', 'Lớp')).toBe('className');
    expect(headerField('classes', 'Class')).toBe('className');
    expect(headerField('classes', 'GVCN/Form Teacher:')).toBe('homeroom');
    expect(headerField('classes', 'GVCN/ Form teacher')).toBe('homeroom');
    expect(headerField('classes', 'PCN/Co-teacher')).toBe('assistant');
    expect(headerField('classes', 'Phó chủ nhiệm/Co-Teacher')).toBe('assistant');
    expect(headerField('classes', 'Mob CN')).toBe('homeroomPhone');
    expect(headerField('classes', 'Email PCN')).toBe('assistantEmail');
  });

  it("doesn't take a subject named after a class meeting for the class", () => {
    expect(headerField('assignments', 'SH lớp-GDPC/ Class meeting')).toBeNull();
    expect(headerField('assignments', 'Class')).toBe('className');
  });
});

describe('headerColumns', () => {
  it("makes ID GV 1S's second HỌ TÊN the short name", () => {
    expect(headerColumns('teachers', SCHOOL_TEACHERS.rows[1] ?? [])).toEqual({
      shortName: 2,
      fullName: 1,
      email: 4,
      phone: 3,
      school: 5,
      alsoAt: 6,
    });
  });

  it('takes the first column naming a field', () => {
    expect(headerColumns('classes', ['Lớp', 'GVCN', 'GVCN/Form teacher'])).toEqual({
      className: 0,
      homeroom: 1,
      assistant: null,
      homeroomPhone: null,
      assistantPhone: null,
      homeroomEmail: null,
      assistantEmail: null,
    });
  });

  it('knows Data ’s phone and email columns, apart from the names beside them', () => {
    expect(
      headerColumns('classes', [
        'Lớp',
        'GVCN/Form Teacher:',
        'PCN/Co-teacher',
        'Mob CN',
        'Mob PCN',
        'Email CN',
        'Email PCN',
      ]),
    ).toEqual({
      className: 0,
      homeroom: 1,
      assistant: 2,
      homeroomPhone: 3,
      assistantPhone: 4,
      homeroomEmail: 5,
      assistantEmail: 6,
    });
  });
});

describe('findHeaderRow', () => {
  it("finds Data's header in row 6 and Phan cong's in row 2", () => {
    expect(findHeaderRow('classes', SCHOOL_DATA)).toBe(5);
    expect(findHeaderRow('assignments', SCHOOL_ASSIGNMENTS)).toBe(1);
    expect(findHeaderRow('teachers', SCHOOL_TEACHERS)).toBe(1);
  });

  it('needs the field the kind can’t do without', () => {
    expect(findHeaderRow('teachers', sheet('x', [['Email', 'Điện thoại']]))).toBeNull();
    expect(findHeaderRow('classes', sheet('x', [['GVCN', 'PCN']]))).toBeNull();
  });

  it('looks no further than the first 10 rows', () => {
    const rows: string[][] = Array.from({ length: 10 }, () => ['x']);
    expect(findHeaderRow('classes', sheet('x', [...rows, ['Lớp', 'GVCN']]))).toBeNull();
  });
});

describe('blockFromCode and dayFromText', () => {
  it('reads THCS12 to THCS910 and 1-2 to 9-10', () => {
    expect(['THCS12', 'THCS34', 'THCS56', 'THCS78', 'THCS910'].map(blockFromCode)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(['1-2', '3 - 4', '9-10'].map(blockFromCode)).toEqual([0, 1, 4]);
  });

  it('reads a 1-2 that Excel turned into a date, in either date order', () => {
    // A typed "1-2" is 2 January or 1 February, by the computer's date order.
    expect(
      ['02/01/2026', '01/02/2026', '04/03/2026', '10/09/2026', '09/10/2026'].map(blockFromCode),
    ).toEqual([0, 0, 1, 4, 4]);
    expect(['03/09/2026', '02/03/2026', '11/12/2026', '01/01/2026'].map(blockFromCode)).toEqual(
      Array(4).fill(null),
    );
  });

  it("isn't fooled by counts or other numbers", () => {
    expect(['12', '910', 'THCS911', 'THCS23', '2-3', '', 'Tiết'].map(blockFromCode)).toEqual(
      Array(7).fill(null),
    );
  });

  it('reads day codes and names, Monday to Friday', () => {
    expect(['Th2', 'T3', 'th4', 'Th5', 'T6'].map(dayFromText)).toEqual([0, 1, 2, 3, 4]);
    expect(dayFromText('Thứ Hai / Monday')).toBe(0);
    expect(dayFromText('Thứ Sáu / Friday')).toBe(4);
    expect(dayFromText('Thứ 4')).toBe(2);
    expect(dayFromText('Wednesday')).toBe(2);
  });

  it('has no Saturday and no other text', () => {
    expect(['Thứ Bảy', 'Th7', 'T1', 'Saturday', '8:00 - 9:10', ''].map(dayFromText)).toEqual(
      Array(6).fill(null),
    );
  });
});

describe('readTimetableLayout', () => {
  it("finds HK1's classes up to its Tiết column, and each block's subject row by day", () => {
    const layout = readTimetableLayout(schoolGrid());
    expect(layout?.headerRow).toBe(0);
    expect(layout?.classes).toEqual([
      { column: 5, name: '6A1' },
      { column: 6, name: '6A2' },
    ]);
    expect(layout?.blocks).toEqual([
      { row: 3, day: 0, block: 0 },
      { row: 5, day: 0, block: 1 },
      { row: 8, day: 1, block: 0 },
      { row: 10, day: 1, block: 1 },
    ]);
    expect(layout?.dayless).toEqual([]);
  });

  it('stops the classes at a repeated name or a gap', () => {
    const grid = schoolGrid();
    grid.rows[0] = [...HEAD, '6A1', '6A2', '6A1'];
    expect(readTimetableLayout(grid)?.classes.map((c) => c.name)).toEqual(['6A1', '6A2']);
    grid.rows[0] = [...HEAD, '6A1', '', '6A2'];
    expect(readTimetableLayout(grid)?.classes.map((c) => c.name)).toEqual(['6A1']);
  });

  it('reports a cell that tries to be a class name and keeps reading past it', () => {
    const grid = schoolGrid();
    grid.rows[0] = [...HEAD, '6A1', '6Z1', '6A2', 'Tiết'];
    const layout = readTimetableLayout(grid);
    expect(layout?.classes).toEqual([
      { column: 5, name: '6A1' },
      { column: 7, name: '6A2' },
    ]);
    expect(layout?.badClasses).toEqual([{ column: 6, name: '6Z1' }]);
  });

  it('reports a mistyped name in the first class column', () => {
    const grid = schoolGrid();
    grid.rows[0] = [...HEAD, '6Z1', '6A1', '6A2'];
    const layout = readTimetableLayout(grid);
    expect(layout?.badClasses).toEqual([{ column: 5, name: '6Z1' }]);
    expect(layout?.classes.map((c) => c.column)).toEqual([6, 7]);
    expect(layout?.firstClassColumn).toBe(5);
  });

  it('says where the classes stop when class names it won’t read come after', () => {
    const grid = schoolGrid();
    grid.rows[0] = [...HEAD, '6A1', '', '6A2', '6A2'];
    expect(readTimetableLayout(grid)?.stopped).toEqual({ column: 6, lost: ['6A2'] });
    grid.rows[0] = [...HEAD, '6A1', '6A2', '6A1', '7A1'];
    expect(readTimetableLayout(grid)?.stopped).toEqual({ column: 7, lost: ['7A1'] });
  });

  it('doesn’t count HK1’s counting columns as classes it stopped before', () => {
    expect(readTimetableLayout(schoolGrid())?.stopped).toBeNull();
  });

  it('says which column holds the periods', () => {
    expect(readTimetableLayout(schoolGrid())?.periodColumn).toBe(3);
  });

  it('keeps rows on a Saturday or Sunday apart from the five school days', () => {
    const grid = schoolGrid(['Th2']);
    grid.rows.push(['Thứ Bảy / Saturday', 'Th7', 'T7', 'THCS12', '8:00 - 9:10', 'Toán', 'Toán']);
    grid.rows.push(['', 'CN', '', 'THCS34', '9:20 - 10:30', 'Toán', 'Toán']);
    const layout = readTimetableLayout(grid);
    expect(layout?.weekend).toEqual([7, 8]);
    expect(layout?.blocks.map((b) => b.row)).toEqual([3, 5]);
  });

  it('carries a day written once, unmerged, down to the rows under it', () => {
    const grid = schoolGrid();
    // Only each day's first row names it; the rest of the day's rows are blank there.
    grid.rows = grid.rows.map((row, index) =>
      index === 2 || index === 7 ? row : ['', '', '', ...row.slice(3)],
    );
    expect(readTimetableLayout(grid)?.blocks).toEqual([
      { row: 3, day: 0, block: 0 },
      { row: 5, day: 0, block: 1 },
      { row: 8, day: 1, block: 0 },
      { row: 10, day: 1, block: 1 },
    ]);
  });

  it('lists block rows with no day named on them or above them', () => {
    const grid = schoolGrid(['Th2', 'Th3']);
    // Monday's rows name no day; Tuesday's do.
    for (const index of [2, 3, 4, 5, 6]) {
      grid.rows[index] = ['', '', '', ...(grid.rows[index] ?? []).slice(3)];
    }
    expect(readTimetableLayout(grid)?.dayless).toEqual([3, 5]);
    expect(readTimetableLayout(grid)?.blocks.map((b) => b.row)).toEqual([8, 10]);
  });

  it('reads a period column of 1-2 labels that Excel turned into dates', () => {
    const grid = schoolGrid(['Th2']);
    grid.rows[3] = ['Thứ Hai / Monday', 'Th2', 'T2', '02/01/2026', '8:00 - 9:10', 'Toán'];
    grid.rows[5] = ['Thứ Hai / Monday', 'Th2', 'T2', '04/03/2026', '9:20 - 10:30', 'Toán'];
    expect(readTimetableLayout(grid)?.blocks.map((b) => b.block)).toEqual([0, 1]);
  });

  it("isn't a timetable without class names or block codes", () => {
    expect(readTimetableLayout(SCHOOL_TEACHERS)).toBeNull();
    expect(
      readTimetableLayout(
        sheet('x', [
          ['Lớp', '6A1'],
          ['Thứ 2', 'Toán'],
        ]),
      ),
    ).toBeNull();
  });
});

describe('suggestImport', () => {
  it("picks the school's sheets by name, with their header rows and columns", () => {
    expect(suggestImport(schoolWorkbook())).toEqual({
      timetable: { sheet: 'HK1' },
      teachers: {
        sheet: 'ID GV 1S',
        headerRow: 1,
        columns: { shortName: 2, fullName: 1, email: 4, phone: 3, school: 5, alsoAt: 6 },
      },
      classes: {
        sheet: 'Data ',
        headerRow: 5,
        columns: {
          className: 7,
          homeroom: 8,
          assistant: 9,
          homeroomPhone: 10,
          assistantPhone: 11,
          homeroomEmail: 12,
          assistantEmail: 13,
        },
      },
      assignments: { sheet: 'Phan cong', headerRow: 1, columns: { className: 1 } },
      teacherFrom: 'row',
    });
  });

  it('finds sheets with other names by their layout, but not teaching assignments', () => {
    const workbook: WorkbookData = {
      fileName: 'Other.xlsx',
      sheets: [
        sheet('Staff', [['Short name', 'Full name', 'Email']]),
        sheet('Homerooms', [['Class', 'Homeroom teacher']]),
        { ...schoolGrid(), name: 'Week' },
        { ...SCHOOL_ASSIGNMENTS, name: 'Who teaches what' },
      ],
    };
    const choices = suggestImport(workbook);
    expect(choices.timetable.sheet).toBe('Week');
    expect(choices.teachers.sheet).toBe('Staff');
    // The assignments sheet names a class and a homeroom teacher too, so the classes
    // suggestion takes the first such sheet; you can change it.
    expect(choices.classes.sheet).toBe('Homerooms');
    expect(choices.assignments).toEqual({
      sheet: null,
      headerRow: 0,
      columns: { className: null },
    });
  });

  it('leaves out a kind no sheet fits, with every field not imported', () => {
    const choices = suggestImport({ fileName: 'x.xlsx', sheets: [schoolGrid()] });
    expect(choices.teachers).toEqual({
      sheet: null,
      headerRow: 0,
      columns: {
        shortName: null,
        fullName: null,
        email: null,
        phone: null,
        school: null,
        alsoAt: null,
      },
    });
    expect(choices.classes.sheet).toBeNull();
  });

  it('finds a classes sheet named in English or Vietnamese before one only laid out for it', () => {
    for (const name of ['Classes', 'Lớp']) {
      const workbook: WorkbookData = {
        fileName: 'x.xlsx',
        sheets: [
          { ...SCHOOL_ASSIGNMENTS, name: 'Assignments' },
          sheet(name, [['Class', 'Homeroom teacher']]),
        ],
      };
      expect(suggestImport(workbook).classes.sheet).toBe(name);
    }
  });

  it('prefers a visible sheet to a hidden one with a name it knows', () => {
    const workbook: WorkbookData = {
      fileName: 'x.xlsx',
      sheets: [{ ...schoolGrid(), name: 'TKB tổng hợp', hidden: true }, schoolGrid()],
    };
    expect(suggestImport(workbook).timetable.sheet).toBe('HK1');
  });
});

describe('sheetOptions', () => {
  it('lists the sheets in workbook order, hidden ones last', () => {
    expect(sheetOptions(schoolWorkbook().sheets).map((s) => s.name)).toEqual([
      'TIMETABLE',
      'Data ',
      'Phan cong',
      'HK1',
      'ID GV 1S',
      'TKB 1S',
    ]);
  });
});

describe("the Import screen's choices", () => {
  const list = sheet('Teachers list', [
    ['A title'],
    ['Tên ngắn/ Short name', '', 'Email'],
    ['Cô Lan', '', 'lan@school.example'],
    [],
    ['Thầy Phúc', '', ''],
    ['Cô Ngân'],
    ['Cô Mai'],
  ]);
  const other = sheet('Other', [
    ['Short name', 'Phone'],
    ['Cô Hoa', '0912345678'],
  ]);
  const assignments = sheet('Phan cong', [
    ['Lớp', 'Toán'],
    ['6A1', 'Cô Lan'],
  ]);
  const book: WorkbookData = { fileName: 'TKB.xlsx', sheets: [list, other, assignments] };

  it('changing a sheet starts its columns again from the suggestions', () => {
    const start = suggestImport(book);
    const changed = chooseColumn(start, 'teachers', 'email', null);
    const next = chooseListSheet(book, changed, 'teachers', 'Other');
    expect(next.teachers).toMatchObject({
      sheet: 'Other',
      headerRow: 0,
      columns: { shortName: 0, phone: 1, email: null },
    });
  });

  it('leaving a sheet out clears its columns, and leaving out assignments goes back to the row', () => {
    const start = { ...suggestImport(book), teacherFrom: 'assignments' as const };
    const left = chooseListSheet(book, start, 'assignments', null);
    expect(left.assignments.sheet).toBeNull();
    expect(left.assignments.columns.className).toBeNull();
    expect(left.teacherFrom).toBe('row');
    expect(chooseListSheet(book, start, 'teachers', null).teacherFrom).toBe('assignments');
  });

  it('changing the header row suggests the columns from that row', () => {
    const start = chooseListSheet(book, suggestImport(book), 'teachers', 'Teachers list');
    expect(start.teachers.headerRow).toBe(1);
    const next = chooseHeaderRow(book, start, 'teachers', 0);
    expect(next.teachers).toMatchObject({
      headerRow: 0,
      columns: { shortName: null, email: null },
    });
  });

  it('a field can be set to a column or to not imported, leaving the others', () => {
    const start = chooseListSheet(book, suggestImport(book), 'teachers', 'Teachers list');
    const next = chooseColumn(start, 'teachers', 'fullName', 2);
    expect(next.teachers.columns.fullName).toBe(2);
    expect(next.teachers.columns.shortName).toBe(0);
    expect(chooseColumn(next, 'teachers', 'fullName', null).teachers.columns.fullName).toBeNull();
  });

  it('the Column dropdowns offer the header cells that hold something, by letter', () => {
    expect(columnOptions(list, 1)).toEqual([
      { column: 0, label: 'A · Tên ngắn/ Short name' },
      { column: 2, label: 'C · Email' },
    ]);
    expect(columnOptions(undefined, 0)).toEqual([]);
  });

  it('first values are the first three below the header, passing over empty cells', () => {
    expect(firstValues(list, 1, 0)).toBe('Cô Lan, Thầy Phúc, Cô Ngân');
    expect(firstValues(list, 1, 2)).toBe('lan@school.example');
    expect(firstValues(list, 1, 1)).toBe('');
  });

  it('asks for a required column only on a sheet that is used', () => {
    const start = chooseListSheet(book, suggestImport(book), 'teachers', 'Teachers list');
    expect(requiredColumnMessage('teachers', start)).toBeNull();
    const without = chooseColumn(start, 'teachers', 'shortName', null);
    expect(requiredColumnMessage('teachers', without)).toBe(
      'Choose the column with the short names.',
    );
    const out = chooseListSheet(book, without, 'teachers', null);
    expect(requiredColumnMessage('teachers', out)).toBeNull();
    const classes = chooseListSheet(book, start, 'classes', 'Other');
    expect(requiredColumnMessage('classes', classes)).toBe(
      'Choose the column with the class names.',
    );
  });

  const grid = (codes: readonly (readonly [string, string])[]) =>
    sheet('HK1', [
      ['', '', '6A1', '6A2'],
      ...codes.flatMap(([day, code]) => [
        [day, code, 'Toán', 'Văn'],
        [day, '', 'Cô Lan', 'Cô Hoa'],
      ]),
    ]);

  it('says what a timetable sheet holds', () => {
    const week = ['Th2', 'Th3', 'Th4', 'Th5', 'Th6'].flatMap((day) => [
      [day, 'THCS12'] as const,
      [day, 'THCS34'] as const,
    ]);
    expect(timetableFound(grid(week))).toBe('2 classes, Monday to Friday, 2 blocks a day');
    expect(timetableFound(grid([['Th2', 'THCS12']]))).toBe('2 classes, Monday, 1 block a day');
    expect(
      timetableFound(
        grid([
          ['Th2', 'THCS12'],
          ['Th4', 'THCS12'],
        ]),
      ),
    ).toBe('2 classes, Monday and Wednesday, 1 block a day');
    expect(timetableFound(other)).toBe("This sheet isn't laid out as a timetable.");
  });

  it("asks for the assignments sheet's class column only when a card's teacher comes from it", () => {
    const start = chooseListSheet(book, suggestImport(book), 'assignments', 'Other');
    expect(start.teacherFrom).toBe('row');
    expect(requiredColumnMessage('assignments', start)).toBeNull();
    expect(requiredColumnMessage('assignments', { ...start, teacherFrom: 'assignments' })).toBe(
      'Choose the column with the class names.',
    );
  });

  it('compares choices by what they import, not by object', () => {
    const start = suggestImport(book);
    expect(sameChoices(start, suggestImport(book))).toBe(true);
    expect(sameChoices(start, { ...start, teacherFrom: 'row' })).toBe(true);
    const changed = chooseColumn(start, 'teachers', 'email', null);
    expect(sameChoices(start, changed)).toBe(false);
    expect(sameChoices(start, chooseColumn(changed, 'teachers', 'email', 2))).toBe(true);
    expect(sameChoices(start, { ...start, teacherFrom: 'assignments' })).toBe(false);
    expect(sameChoices(start, { ...start, timetable: { sheet: 'Other' } })).toBe(false);
    expect(sameChoices(start, chooseHeaderRow(book, start, 'teachers', 0))).toBe(false);
    expect(sameChoices(start, chooseListSheet(book, start, 'classes', null))).toBe(
      start.classes.sheet === null,
    );
  });

  it('starts a new profile at the file name without .xlsx', () => {
    expect(importProfileName('TKB 2026.XLSX')).toBe('TKB 2026');
  });
});
