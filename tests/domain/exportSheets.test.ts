import { describe, expect, it } from 'vitest';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { DEFAULT_BELL_SCHEDULE } from '../../src/domain/bellSchedule';
import {
  CLASS_SHEET_ROW_LABELS,
  classSheet,
  DATA_HEADER,
  DATA_LOOKUP_COLUMNS,
  dataSheet,
  teacherSheet,
  dayCode,
  exportFileName,
  GRID_DAY_NAMES,
  GRID_HEADER,
  GRID_ROW_LABELS,
  gridRowIndex,
  gridSheet,
  JOINED_SUBJECTS,
  parseSlotText,
  periodCode,
  shortDayCode,
  slotText,
  type ClassSheet,
  type ExportDetails,
} from '../../src/domain/exportSheets';
import type { Card, Placement, ScheduleRow, TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';

const details: ExportDetails = {
  schoolName: 'Trung học/Secondary School',
  schoolYear: '2026 - 2027',
  appliesFrom: '2026-09-03',
};

const card = (id: string, subjectId: string, teacherId: string | null) =>
  ({ id, subjectId, teacherId, roomId: null }) satisfies Card;
const placed = (id: string, cardId: string, block: 0 | 1 | 2 | 3, part: Placement['part']) =>
  ({ id, cardId, classId: 'c', day: 0, block, part }) satisfies Placement;

// One class on Monday: a full block, two halves (each with a teacher), one half alone in
// each half, and a card with no teacher.
function school(): TimetableFile {
  return {
    ...createEmptyTimetable(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'shl', name: 'Sinh hoạt lớp', colorKey: 'homeroom' },
      { id: 'gdpc', name: 'Giáo dục phẩm chất', colorKey: 'homeroom' },
    ],
    teachers: [
      { id: 'hoa', shortName: 'T. Hoa', conditions: [] },
      { id: 'lan', shortName: 'T. Lan', conditions: [] },
    ],
    classes: [{ id: 'c', name: '6A1', grade: 6, track: 'A', section: 1 }],
    cards: [
      card('k-toan', 'toan', 'hoa'),
      card('k-shl', 'shl', 'hoa'),
      card('k-gdpc', 'gdpc', 'lan'),
      card('k-gdpc-none', 'gdpc', null),
    ],
    placements: [
      placed('p1', 'k-toan', 0, 'full'),
      placed('p2', 'k-shl', 1, 'first'),
      placed('p3', 'k-gdpc', 1, 'second'),
      placed('p4', 'k-toan', 2, 'first'),
      placed('p5', 'k-gdpc-none', 3, 'second'),
    ],
  };
}

describe('slotText', () => {
  it('gives a full card its subject and teacher short name', () => {
    expect(slotText(school(), 'c', 0, 0)).toEqual({ subject: 'Toán', teacher: 'T. Hoa' });
  });

  it('joins two halves with " + "', () => {
    expect(slotText(school(), 'c', 0, 1)).toEqual({
      subject: 'Sinh hoạt lớp + Giáo dục phẩm chất',
      teacher: 'T. Hoa + T. Lan',
    });
  });

  it('writes two halves part by part, an empty part for a half with no teacher', () => {
    const withTeacher = (cardId: string, teacherId: string | null) => ({
      ...school(),
      cards: school().cards.map((c) => (c.id === cardId ? { ...c, teacherId } : c)),
    });
    expect(slotText(withTeacher('k-gdpc', null), 'c', 0, 1).teacher).toBe('T. Hoa +');
    expect(slotText(withTeacher('k-shl', null), 'c', 0, 1).teacher).toBe('+ T. Lan');
    const neither = withTeacher('k-shl', null);
    neither.cards = neither.cards.map((c) => (c.id === 'k-gdpc' ? { ...c, teacherId: null } : c));
    expect(slotText(neither, 'c', 0, 1).teacher).toBe('');
  });

  it('writes a part once when both halves have it: one teacher, or one subject', () => {
    const oneTeacher = {
      ...school(),
      cards: school().cards.map((c) => (c.id === 'k-gdpc' ? { ...c, teacherId: 'hoa' } : c)),
    };
    expect(slotText(oneTeacher, 'c', 0, 1)).toEqual({
      subject: 'Sinh hoạt lớp + Giáo dục phẩm chất',
      teacher: 'T. Hoa',
    });
    // Toán split between two teachers in one block.
    const file = school();
    const twoTeachers: TimetableFile = {
      ...file,
      cards: [...file.cards, card('k-toan-lan', 'toan', 'lan')],
      placements: [
        ...file.placements.filter((p) => p.block !== 1),
        placed('p6', 'k-toan', 1, 'first'),
        placed('p7', 'k-toan-lan', 1, 'second'),
      ],
    };
    expect(slotText(twoTeachers, 'c', 0, 1)).toEqual({
      subject: 'Toán',
      teacher: 'T. Hoa + T. Lan',
    });
  });

  it('reads a changed timetable afresh, as the store gives a new file for every change', () => {
    const file = school();
    expect(slotText(file, 'c', 0, 0).subject).toBe('Toán');
    const changed = { ...file, placements: file.placements.filter((p) => p.id !== 'p1') };
    expect(slotText(changed, 'c', 0, 0).subject).toBe('');
    expect(slotText(file, 'c', 0, 0).subject).toBe('Toán');
  });

  it('writes one half alone with its half', () => {
    expect(slotText(school(), 'c', 0, 2)).toEqual({
      subject: 'Toán (first half)',
      teacher: 'T. Hoa',
    });
    expect(slotText(school(), 'c', 0, 3)).toEqual({
      subject: 'Giáo dục phẩm chất (second half)',
      teacher: '',
    });
  });

  it('is empty when nothing is placed, and for another class or day', () => {
    expect(slotText(school(), 'c', 0, 4)).toEqual({ subject: '', teacher: '' });
    expect(slotText(school(), 'c', 1, 0)).toEqual({ subject: '', teacher: '' });
    expect(slotText(school(), 'other', 0, 0)).toEqual({ subject: '', teacher: '' });
  });
});

describe('classSheet', () => {
  it('has the title lines and the school line from the export details', () => {
    const sheet = classSheet(school(), 'c', details);
    expect(sheet.name).toBe('6A1');
    expect(sheet.title).toEqual([
      'THỜI KHÓA BIỂU NĂM HỌC 2026 - 2027',
      'SCHOOL SCHEDULE 2026 - 2027',
      '(Áp dụng từ ngày 03/09/2026)',
    ]);
    expect(sheet.school).toBe('Trường/School: Trung học/Secondary School');
  });

  it("has the homeroom teacher's full name, phone, and email in the header", () => {
    const file: TimetableFile = {
      ...school(),
      teachers: [
        {
          id: 'hoa',
          shortName: 'T. Hoa',
          fullName: 'Lê Thị Hoa',
          phone: '0912 345 678',
          email: 'hoa@example.com',
          conditions: [],
        },
      ],
      classes: [{ ...school().classes[0]!, formTeacherId: 'hoa' }],
    };
    expect(classSheet(file, 'c', details).homeroom).toEqual({
      fullName: 'Lê Thị Hoa',
      phone: '0912 345 678',
      email: 'hoa@example.com',
    });
  });

  it('leaves the header empty with no homeroom teacher, and uses the short name for a missing full name', () => {
    expect(classSheet(school(), 'c', details).homeroom).toEqual({
      fullName: '',
      phone: '',
      email: '',
    });
    const file = { ...school(), classes: [{ ...school().classes[0]!, formTeacherId: 'lan' }] };
    expect(classSheet(file, 'c', details).homeroom).toEqual({
      fullName: 'T. Lan',
      phone: '',
      email: '',
    });
  });

  it('has a row per bell schedule row, with its bilingual label and times, and a finish row', () => {
    const rows = classSheet(school(), 'c', details).rows;
    expect(rows.map((r) => (r.kind === 'block' ? r.label : r.spans.map((s) => s.text)))).toEqual([
      ['Đón học sinh, ăn sáng / Breakfast'],
      ['Chào cờ', 'Hoạt động đầu ngày/Getting ready'],
      '1-2',
      ['Giờ chơi/ Break'],
      '3-4',
      ['Giờ chơi/ Break'],
      '5-6',
      ['Ăn trưa & Nghỉ trưa/ Lunch time & Nap time'],
      '7-8',
      ['Ăn nhẹ/Snack time'],
      '9-10',
      ['Kết thúc / Finish'],
    ]);
    expect(rows.map((r) => r.time)).toEqual([
      '7:00 - 7:50',
      '7:50 - 8:00',
      '8:00 - 9:10',
      '9:10 - 9:20',
      '9:20 - 10:30',
      '10:30 - 10:40',
      '10:40 - 11:50',
      '11:50 - 13:20',
      '13:20 - 14:30',
      '14:30 - 14:50',
      '14:50 - 16:00',
      '16:00',
    ]);
  });

  it("spans a fixed row's days that read the same, splitting off Monday's flag salute", () => {
    const rows = classSheet(school(), 'c', details).rows;
    expect(rows[0]).toEqual({
      kind: 'fixed',
      type: 'arrival',
      time: '7:00 - 7:50',
      spans: [{ firstDay: 0, lastDay: 4, text: 'Đón học sinh, ăn sáng / Breakfast' }],
    });
    expect(rows[1]).toMatchObject({
      spans: [
        { firstDay: 0, lastDay: 0, text: 'Chào cờ' },
        { firstDay: 1, lastDay: 4, text: 'Hoạt động đầu ngày/Getting ready' },
      ],
    });
    expect(rows.at(-1)).toMatchObject({ type: 'finish' });
  });

  it('follows the profile\'s bell schedule, writing an unknown fixed row as "note/ label"', () => {
    const bellSchedule: ScheduleRow[] = [
      { kind: 'block', block: 0, label: '1-2', start: '07:30', end: '08:40' },
      {
        kind: 'break',
        type: 'break',
        label: 'Assembly',
        note: 'Tập trung',
        start: '08:40',
        end: '09:00',
      },
      { kind: 'break', type: 'break', label: 'Recess', start: '09:00', end: '09:05' },
      { kind: 'block', block: 1, label: '3-4', start: '09:05', end: '10:15' },
    ];
    const rows = classSheet({ ...school(), bellSchedule }, 'c', details).rows;
    expect(rows.map((r) => (r.kind === 'block' ? r.label : r.spans[0]!.text))).toEqual([
      '1-2',
      'Tập trung/ Assembly',
      'Recess',
      '3-4',
      'Kết thúc / Finish',
    ]);
    expect(rows.at(-1)!.time).toBe('10:15');
  });

  it('writes the subject text of each block, Monday to Friday', () => {
    const block = classSheet(school(), 'c', details).rows.find(
      (r) => r.kind === 'block' && r.block === 1,
    );
    expect(block).toMatchObject({
      subjects: ['Sinh hoạt lớp + Giáo dục phẩm chất', '', '', '', ''],
    });
  });

  it("matches the sample school's 6A1 sheet, written out by hand", () => {
    const expected: ClassSheet = {
      name: '6A1',
      title: [
        'THỜI KHÓA BIỂU NĂM HỌC 2026 - 2027',
        'SCHOOL SCHEDULE 2026 - 2027',
        '(Áp dụng từ ngày 03/09/2026)',
      ],
      school: 'Trường/School: Trung học/Secondary School',
      homeroom: {
        fullName: 'Lương Thị Ngân',
        phone: '0912 345 678',
        email: 'ngan.lt@example.com',
      },
      rows: [
        {
          kind: 'fixed',
          type: 'arrival',
          time: '7:00 - 7:50',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Đón học sinh, ăn sáng / Breakfast' }],
        },
        {
          kind: 'fixed',
          type: 'arrival',
          time: '7:50 - 8:00',
          spans: [
            { firstDay: 0, lastDay: 0, text: 'Chào cờ' },
            { firstDay: 1, lastDay: 4, text: 'Hoạt động đầu ngày/Getting ready' },
          ],
        },
        {
          kind: 'block',
          block: 0,
          label: '1-2',
          time: '8:00 - 9:10',
          subjects: ['Toán', 'Tiếng Anh', 'Tin học (first half)', 'Ngữ văn', ''],
        },
        {
          kind: 'fixed',
          type: 'break',
          time: '9:10 - 9:20',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Giờ chơi/ Break' }],
        },
        {
          kind: 'block',
          block: 1,
          label: '3-4',
          time: '9:20 - 10:30',
          subjects: ['Ngữ văn', '', 'Toán', '', ''],
        },
        {
          kind: 'fixed',
          type: 'break',
          time: '10:30 - 10:40',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Giờ chơi/ Break' }],
        },
        {
          kind: 'block',
          block: 2,
          label: '5-6',
          time: '10:40 - 11:50',
          subjects: ['', '', '', '', 'Tin học (second half)'],
        },
        {
          kind: 'fixed',
          type: 'lunch',
          time: '11:50 - 13:20',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time' }],
        },
        {
          kind: 'block',
          block: 3,
          label: '7-8',
          time: '13:20 - 14:30',
          subjects: ['', 'Thể dục', '', 'Toán phân hoá/ Ngoại ngữ 2', ''],
        },
        {
          kind: 'fixed',
          type: 'break',
          time: '14:30 - 14:50',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Ăn nhẹ/Snack time' }],
        },
        {
          kind: 'block',
          block: 4,
          label: '9-10',
          time: '14:50 - 16:00',
          subjects: ['', '', '', '', 'SH lớp + GDPC'],
        },
        {
          kind: 'fixed',
          type: 'finish',
          time: '16:00',
          spans: [{ firstDay: 0, lastDay: 4, text: 'Kết thúc / Finish' }],
        },
      ],
    };
    expect(classSheet(exampleSchool, 'c-6a1', details)).toEqual(expected);
  });
});

describe('gridSheet', () => {
  const grid = gridSheet(exampleSchool, ['c-6a1', 'c-6a2']);

  it('is called TKB tổng hợp and has a column per class in the order asked', () => {
    expect(grid.name).toBe('TKB tổng hợp');
    expect(grid.classNames).toEqual(['6A1', '6A2']);
  });

  it('repeats the bell schedule for each day, a block as a subject row then a teacher row', () => {
    const monday = grid.rows.filter((r) => r.day === 0);
    expect(monday.map((r) => r.kind)).toEqual([
      'fixed',
      'fixed',
      'subject',
      'teacher',
      'fixed',
      'subject',
      'teacher',
      'fixed',
      'subject',
      'teacher',
      'fixed',
      'subject',
      'teacher',
      'fixed',
      'subject',
      'teacher',
      'fixed',
    ]);
    expect(grid.rows).toHaveLength(17 * 5);
    expect(grid.rows.filter((r) => r.day === 4)).toHaveLength(17);
  });

  it('has the day codes and period codes as HK1 has them', () => {
    expect([0, 1, 2, 3, 4].map((d) => dayCode(d as 0))).toEqual([
      'Th2',
      'Th3',
      'Th4',
      'Th5',
      'Th6',
    ]);
    expect([0, 1, 2, 3, 4].map((b) => periodCode(b as 0))).toEqual([
      'THCS12',
      'THCS34',
      'THCS56',
      'THCS78',
      'THCS910',
    ]);
    const codes = grid.rows.flatMap((r) =>
      r.kind === 'subject' && r.day === 1 ? [r.periodCode] : [],
    );
    expect(codes).toEqual(['THCS12', 'THCS34', 'THCS56', 'THCS78', 'THCS910']);
  });

  it('writes the subjects and teachers per class', () => {
    const at = (day: number, kind: 'subject' | 'teacher', block: number) =>
      grid.rows.find((r) => r.day === day && r.kind === kind && r.block === block);
    expect(at(0, 'subject', 1)).toMatchObject({
      time: '9:20 - 10:30',
      cells: ['Ngữ văn', 'Ngữ văn'],
    });
    expect(at(0, 'teacher', 1)).toMatchObject({ cells: ['Cô Ngân', 'Cô Ngân'] });
    expect(at(4, 'subject', 4)).toMatchObject({ cells: ['SH lớp + GDPC', ''] });
    expect(at(4, 'teacher', 4)).toMatchObject({ cells: ['Cô Ngân', ''] });
    expect(at(2, 'subject', 0)).toMatchObject({ cells: ['Tin học (first half)', ''] });
  });

  it("writes the fixed rows in HK1's wording, with getting ready the same every day", () => {
    const monday = grid.rows.filter((r) => r.day === 0 && r.kind === 'fixed');
    expect(monday.map((r) => r.kind === 'fixed' && r.text)).toEqual([
      'Ăn sáng/ Breakfast',
      'Chào cờ/ Hoạt động đầu ngày',
      'Giờ chơi/ Break',
      'Giờ chơi/ Break',
      'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time',
      'Ăn nhẹ/ Snack time',
      'Kết thúc/ Finish',
    ]);
    const gettingReady = grid.rows.filter((r) => r.kind === 'fixed' && r.time === '7:50 - 8:00');
    expect(new Set(gettingReady.map((r) => r.kind === 'fixed' && r.text))).toEqual(
      new Set(['Chào cờ/ Hoạt động đầu ngày']),
    );
    expect(grid.rows.at(-1)).toEqual({
      kind: 'fixed',
      day: 4,
      type: 'finish',
      time: '16:00',
      text: 'Kết thúc/ Finish',
    });
  });

  it("has HK1's first columns and day names, and the short day codes", () => {
    expect(GRID_HEADER).toEqual(['Thứ\nDay', '\u00a0', 'Tiết\nPeriod', 'Thời gian\nTime']);
    expect(Object.values(GRID_DAY_NAMES)).toEqual([
      'Thứ Hai / Monday',
      'Thứ Ba / Tuesday',
      'Thứ Tư / Wednesday',
      'Thứ Năm / Thursday',
      'Thứ Sáu / Friday',
    ]);
    expect([0, 1, 2, 3, 4].map((d) => shortDayCode(d as 0))).toEqual([
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
    ]);
  });

  it("finds a block's subject row, for the class sheets' formulas", () => {
    expect(gridRowIndex(grid, 0, 0)).toBe(2);
    expect(gridRowIndex(grid, 1, 0)).toBe(17 + 2);
    expect(grid.rows[gridRowIndex(grid, 3, 3)]).toMatchObject({
      kind: 'subject',
      cells: ['Toán phân hoá/ Ngoại ngữ 2', ''],
    });
    const oneBlock = gridSheet(
      { ...exampleSchool, bellSchedule: DEFAULT_BELL_SCHEDULE.slice(0, 3) },
      [],
    );
    expect(gridRowIndex(oneBlock, 0, 4)).toBe(-1);
  });
});

describe('fixed row labels', () => {
  it("cover every fixed row of the app's bell schedule, so a rename there can't lose them", () => {
    for (const row of DEFAULT_BELL_SCHEDULE) {
      if (row.kind !== 'break') continue;
      expect(CLASS_SHEET_ROW_LABELS).toHaveProperty([row.label]);
      expect(GRID_ROW_LABELS).toHaveProperty([row.label]);
      for (const special of row.dayLabels ?? []) {
        expect(CLASS_SHEET_ROW_LABELS).toHaveProperty([special.label]);
      }
    }
  });
});

describe('dataSheet', () => {
  it("looks up the homeroom teacher's name, phone, and email in the sample's columns", () => {
    expect(DATA_LOOKUP_COLUMNS).toEqual({ fullName: 2, phone: 4, email: 6 });
    const row = dataSheet(exampleSchool, ['c-6a1']).rows[0]!;
    expect(row[DATA_LOOKUP_COLUMNS.fullName - 1]).toBe('Lương Thị Ngân');
    expect(row[DATA_LOOKUP_COLUMNS.phone - 1]).toBe('0912 345 678');
    expect(row[DATA_LOOKUP_COLUMNS.email - 1]).toBe('ngan.lt@example.com');
    expect(DATA_HEADER[DATA_LOOKUP_COLUMNS.phone - 1]).toBe('Mob CN');
  });

  it('has a row per class with its homeroom teacher and assistant, names, phones, and emails', () => {
    const sheet = dataSheet(exampleSchool, ['c-6a1', 'c-6a2', 'c-9ba1']);
    expect(sheet.name).toBe('Data ');
    expect(sheet.header).toEqual([
      'Lớp',
      'GVCN/Form Teacher:',
      'PCN/Co-teacher',
      'Mob CN',
      'Mob PCN',
      'Email CN',
      'Email PCN',
    ]);
    expect(sheet.rows).toEqual([
      [
        '6A1',
        'Lương Thị Ngân',
        'Ông Đức Quân',
        '0912 345 678',
        '0987 654 321',
        'ngan.lt@example.com',
        '',
      ],
      ['6A2', 'Tạ Văn Phúc', '', '', '', 'phuc.tv@example.com', ''],
      ['9BA1', '', '', '', '', '', ''],
    ]);
  });
});

describe('teacherSheet', () => {
  const shortNames = (classIds: string[]) =>
    teacherSheet(exampleSchool, classIds).rows.map((row) => row[2]);

  it('has one header per column, and a numbered row per teacher in teacher-list order', () => {
    const sheet = teacherSheet(exampleSchool, ['c-6a1', 'c-8ce1']);
    expect(sheet.name).toBe('Giáo viên');
    expect(sheet.header).toEqual([
      'TT',
      'Họ tên/ Full name',
      'Tên ngắn/ Short name',
      'Điện thoại/ Phone',
      'Email',
      'Trường dạy chính/ Home school',
      'Trường kiêm nhiệm/ Also teaches at',
    ]);
    expect(sheet.rows[0]).toEqual([
      1,
      'Lương Thị Ngân',
      'Cô Ngân',
      '0912 345 678',
      'ngan.lt@example.com',
      'THCS',
      '',
    ]);
    expect(sheet.rows.map((row) => row[0])).toEqual(sheet.rows.map((_, i) => i + 1));
  });

  it('names a teacher at both schools as at THCS and also at THPT', () => {
    const phuc = teacherSheet(exampleSchool, ['c-6a2']).rows.find((row) => row[2] === 'Thầy Phúc');
    expect(phuc?.slice(5)).toEqual(['THCS', 'THPT']);
  });

  it('leaves out a full name the teacher has none of', () => {
    const hieu = teacherSheet(exampleSchool, ['c-9b1']).rows[0];
    expect(hieu?.slice(1, 3)).toEqual(['', 'Thầy Hiếu']);
  });

  it('has the teachers placed in the classes, and their homeroom teachers and assistants', () => {
    // 8CE1's card teacher and homeroom teacher, and its assistant.
    expect(shortNames(['c-8ce1'])).toEqual(['Cô Vy', 'Cô Trâm']);
    // 9B1 has nothing placed, and its unplaced cards don't count: only its homeroom teacher.
    expect(shortNames(['c-9b1'])).toEqual(['Thầy Hiếu']);
    // A card is counted by the classes it's placed in: Thầy Tùng teaches only 6A1.
    expect(shortNames(['c-6a2'])).not.toContain('Thầy Tùng');
  });

  it('is empty for a class with no teachers', () => {
    expect(teacherSheet(exampleSchool, ['c-9ba1']).rows).toEqual([]);
  });
});

describe('exportFileName', () => {
  it('names one class or all classes, as Excel or PDF', () => {
    expect(exportFileName('class', '6A1', 'xlsx')).toBe('TKB 6A1.xlsx');
    expect(exportFileName('all', '6A1', 'xlsx')).toBe('TKB all classes.xlsx');
    expect(exportFileName('class', '6A1', 'pdf')).toBe('TKB 6A1.pdf');
    expect(exportFileName('all', '6A1', 'pdf')).toBe('TKB all classes.pdf');
  });
});

describe('parseSlotText (the inverse of slotText)', () => {
  it('reads an empty block as nothing, whatever the teacher row says', () => {
    expect(parseSlotText('', '')).toEqual([]);
    expect(parseSlotText('', 'T. Hoa')).toEqual([]);
  });

  it('reads a full block', () => {
    expect(parseSlotText('Toán', 'T. Hoa')).toEqual([
      { part: 'full', subject: 'Toán', teacher: 'T. Hoa' },
    ]);
    expect(parseSlotText('Toán', '')).toEqual([{ part: 'full', subject: 'Toán', teacher: '' }]);
  });

  it('reads one half alone', () => {
    expect(parseSlotText('Toán (first half)', 'T. Hoa')).toEqual([
      { part: 'first', subject: 'Toán', teacher: 'T. Hoa' },
    ]);
    expect(parseSlotText('Toán (second half)', '')).toEqual([
      { part: 'second', subject: 'Toán', teacher: '' },
    ]);
  });

  it('reads two halves, with a teacher each or one for both', () => {
    expect(parseSlotText('Toán + Ngữ văn', 'T. Hoa + T. Lan')).toEqual([
      { part: 'first', subject: 'Toán', teacher: 'T. Hoa' },
      { part: 'second', subject: 'Ngữ văn', teacher: 'T. Lan' },
    ]);
    expect(parseSlotText('Toán + Ngữ văn', 'T. Hoa')).toEqual([
      { part: 'first', subject: 'Toán', teacher: 'T. Hoa' },
      { part: 'second', subject: 'Ngữ văn', teacher: 'T. Hoa' },
    ]);
  });

  it('reads a lone side of the teacher cell as a half with no teacher', () => {
    expect(parseSlotText('Toán + Ngữ văn', 'T. Hoa +')).toEqual([
      { part: 'first', subject: 'Toán', teacher: 'T. Hoa' },
      { part: 'second', subject: 'Ngữ văn', teacher: '' },
    ]);
    expect(parseSlotText('Toán + Ngữ văn', '+ T. Lan')).toEqual([
      { part: 'first', subject: 'Toán', teacher: '' },
      { part: 'second', subject: 'Ngữ văn', teacher: 'T. Lan' },
    ]);
  });

  it('reads one subject with two teachers as that subject in both halves', () => {
    expect(parseSlotText('Toán', 'T. Hoa + T. Lan')).toEqual([
      { part: 'first', subject: 'Toán', teacher: 'T. Hoa' },
      { part: 'second', subject: 'Toán', teacher: 'T. Lan' },
    ]);
  });

  it('splits SH lớp-GDPC into its two halves, both with the cell’s teacher', () => {
    const halves = [
      { part: 'first', subject: 'Sinh hoạt lớp', teacher: 'T. Hoa' },
      { part: 'second', subject: 'Giáo dục phẩm chất', teacher: 'T. Hoa' },
    ];
    expect(parseSlotText('SH lớp-GDPC/ Class meeting', 'T. Hoa')).toEqual(halves);
    expect(parseSlotText('SH lớp-GDPC', 'T. Hoa')).toEqual(halves);
    expect(JOINED_SUBJECTS).toHaveLength(1);
  });

  it('splits only on " + " with spaces', () => {
    expect(parseSlotText('Phát triển cá nhân/ Life+', 'T. Hoa')).toEqual([
      { part: 'full', subject: 'Phát triển cá nhân/ Life+', teacher: 'T. Hoa' },
    ]);
    expect(parseSlotText('A+B', 'T. Hoa+T. Lan')).toEqual([
      { part: 'full', subject: 'A+B', teacher: 'T. Hoa+T. Lan' },
    ]);
  });

  it('reads the same subject and teacher on both sides as one full block', () => {
    expect(parseSlotText('Toán + Toán', 'T. Hoa')).toEqual([
      { part: 'full', subject: 'Toán', teacher: 'T. Hoa' },
    ]);
    expect(parseSlotText('Toán', 'T. Hoa + T. Hoa')).toEqual([
      { part: 'full', subject: 'Toán', teacher: 'T. Hoa' },
    ]);
  });

  it('keeps a cell with more than two parts whole', () => {
    expect(parseSlotText('A + B + C', 'T. Hoa')).toEqual([
      { part: 'full', subject: 'A + B + C', teacher: 'T. Hoa' },
    ]);
  });

  it('cleans the names it reads', () => {
    expect(parseSlotText('  Toán ', ' T.  Hoa ')).toEqual([
      { part: 'full', subject: 'Toán', teacher: 'T. Hoa' },
    ]);
  });

  it('gives back what slotText wrote, for every placed block of the sample school', () => {
    const subjects = new Map(exampleSchool.subjects.map((s) => [s.id, s.name]));
    const teachers = new Map(exampleSchool.teachers.map((t) => [t.id, t.shortName]));
    const cards = new Map(exampleSchool.cards.map((c) => [c.id, c]));
    for (const p of exampleSchool.placements) {
      const card = cards.get(p.cardId)!;
      const text = slotText(exampleSchool, p.classId, p.day, p.block);
      expect(parseSlotText(text.subject, text.teacher)).toContainEqual({
        part: p.part,
        subject: subjects.get(card.subjectId),
        teacher: card.teacherId === null ? '' : teachers.get(card.teacherId),
      });
    }
  });
});
