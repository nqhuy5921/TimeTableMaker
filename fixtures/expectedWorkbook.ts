import type { ExportDetails } from '../src/domain/exportSheets';

// The workbook the Excel export (IE-2, R4-5) should write for the made-up sample school,
// written out by hand from `src/domain/exampleSchool.ts` and the sample workbook's layout (its `6A1`,
// `HK1`, `Data `, and `ID GV 1S` sheets, measured for sizes and styles only; no data copied).
// `tests/main/exportExcel.test.ts` exports the school, reads the file back, and compares
// every cell's value, formula, cached result, and style, every merge, width, and height,
// and the print setup with what's here.

export const EXPORT_DETAILS: ExportDetails = {
  schoolName: 'Trung học/Secondary School',
  schoolYear: '2026 - 2027',
  appliesFrom: '2026-09-03',
};

export const EXPECTED_SHEET_NAMES = [
  '6A1',
  '6A2',
  '7AA1',
  '8CE1',
  '9B1',
  '9BA1',
  'TKB tổng hợp',
  'Data ',
  'Giáo viên',
];

// --- Styles, as ExcelJS reads them back ---

const black = { argb: 'FF000000' };
const thin = { style: 'thin', color: black };
const box = { left: thin, right: thin, top: thin, bottom: thin };
const solid = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const centre = { horizontal: 'center', vertical: 'middle', wrapText: true };
const cambria = (size: number, extra: object = {}) => ({
  name: 'Cambria',
  size,
  color: black,
  ...extra,
});

export const EXPECTED_STYLES = {
  title: {
    font: cambria(16, { bold: true }),
    alignment: { horizontal: 'center', vertical: 'top' },
  },
  titleEnglish: { font: cambria(16, { italic: true }), alignment: { horizontal: 'center' } },
  appliesFrom: { font: cambria(12, { italic: true }), alignment: { horizontal: 'center' } },
  label: { font: cambria(11), alignment: { horizontal: 'left', vertical: 'middle' } },
  labelCentred: { font: cambria(11), alignment: { horizontal: 'center', vertical: 'middle' } },
  value: {
    font: cambria(11, { bold: true }),
    alignment: { horizontal: 'left', vertical: 'middle' },
  },
  valueCentred: {
    font: cambria(11, { bold: true }),
    alignment: { horizontal: 'center', vertical: 'middle' },
  },
  head: { font: cambria(11), fill: solid('FFFBD4B4'), border: box, alignment: centre },
  blockLabel: {
    font: cambria(11),
    fill: solid('FFFBD4B4'),
    border: box,
    alignment: centre,
    numFmt: '@',
  },
  fixedText: {
    font: cambria(11, { italic: true }),
    fill: solid('FFFBD4B4'),
    border: box,
    alignment: centre,
  },
  slot: { font: cambria(11), border: box, alignment: centre },
  gridHead: {
    font: cambria(24, { bold: true }),
    fill: solid('FF92CDDC'),
    border: box,
    alignment: centre,
  },
  gridHeadSmall: {
    font: cambria(18, { bold: true }),
    fill: solid('FF92CDDC'),
    border: box,
    alignment: centre,
  },
  gridClass: {
    font: cambria(18, { bold: true }),
    fill: solid('FFE36C09'),
    border: box,
    alignment: centre,
  },
  // On their side, as in HK1 (R4-8 review).
  gridDay: {
    font: cambria(24, { bold: true }),
    fill: solid('FFD99594'),
    border: box,
    alignment: { ...centre, textRotation: 90 },
  },
  gridShortDay: {
    font: { name: 'Times New Roman', size: 10, bold: true, color: black },
    fill: solid('FF4F81BD'),
    border: box,
    alignment: centre,
  },
  gridPeriod: {
    font: cambria(18),
    fill: solid('FFFBD4B4'),
    border: box,
    alignment: centre,
    numFmt: '@',
  },
  gridFixedPeriod: {
    font: cambria(18, { italic: true }),
    fill: solid('FFFBD4B4'),
    border: box,
    alignment: centre,
    numFmt: '@',
  },
  // Merged across the class columns, from the first (R4-8 review).
  gridFixed: {
    font: cambria(18, { bold: true, italic: true }),
    fill: solid('FFB2A1C7'),
    border: box,
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 },
  },
  gridSubject: { font: cambria(18, { bold: true }), border: box, alignment: centre },
  gridTeacher: {
    font: cambria(18, { color: { argb: 'FFFF0000' } }),
    border: box,
    alignment: centre,
  },
  dataHead: { font: cambria(12, { bold: true }), border: box, alignment: centre },
  dataCell: {
    font: { name: 'Times New Roman', size: 12, color: black },
    border: box,
    alignment: { vertical: 'middle', wrapText: true },
    numFmt: '@',
  },
  /** `Giáo viên`'s TT column: a number, not text. */
  teacherNumber: {
    font: { name: 'Times New Roman', size: 12, color: black },
    border: box,
    alignment: { vertical: 'middle', wrapText: true },
  },
} as const;

export type StyleName = keyof typeof EXPECTED_STYLES;

/** A cell: its value (text, or a formula with its cached result) and its style. A merged
    cell's other cells have the style and no value of their own. */
export type ExpectedCell = [
  value: string | number | { formula: string; result: string } | null,
  style: StyleName,
];

// --- Class sheets ---

export const CLASS_SHEET_COLUMNS = [7.71, 15.29, 25.71, 25.71, 25.71, 25.71, 25.71];

export const CLASS_SHEET_HEIGHTS: Record<number, number> = {
  1: 21.6,
  2: 22.35,
  3: 18.6,
  4: 9.75,
  7: 9,
  8: 28.5,
  9: 16.5,
  10: 16.5,
  11: 45,
  12: 16.5,
  13: 45,
  14: 16.5,
  15: 45,
  16: 16.5,
  17: 45,
  18: 16.5,
  19: 45,
  20: 16.5,
};

export const CLASS_SHEET_MERGES = [
  'A1:G1',
  'A2:G2',
  'A3:G3',
  'E6:F6',
  'C9:G9',
  'D10:G10',
  'C12:G12',
  'C14:G14',
  'C16:G16',
  'C18:G18',
  'C20:G20',
];

export const CLASS_SHEET_PAGE = {
  paperSize: 9,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  zoomScale: 85,
};

/** Each class's header, from `Data `, as the VLOOKUPs' cached results. */
export const CLASS_HEADERS: Record<string, { name: string; phone: string; email: string }> = {
  '6A1': { name: 'Lương Thị Ngân', phone: '0912 345 678', email: 'ngan.lt@example.com' },
  '6A2': { name: 'Tạ Văn Phúc', phone: '', email: 'phuc.tv@example.com' },
  '7AA1': { name: 'Kha Minh Đạt', phone: '', email: '' },
  '8CE1': { name: 'Ứng Ngọc Trâm', phone: '024 3826 1234', email: '' },
  // No full name, so the short name stands in.
  '9B1': { name: 'Thầy Hiếu', phone: '', email: '' },
  '9BA1': { name: '', phone: '', email: '' },
};

const lookup = (column: number) => `VLOOKUP(C6,'Data '!$H$6:$N$12,${column},0)&""`;
const into = (cell: string) => `'TKB tổng hợp'!${cell}&""`;
const breakRow = (time: string, text: string): ExpectedCell[] => [
  [null, 'fixedText'],
  [time, 'head'],
  [text, 'fixedText'],
  [null, 'fixedText'],
  [null, 'fixedText'],
  [null, 'fixedText'],
  [null, 'fixedText'],
];

/** 6A1's sheet, cell by cell from A1 (null for a cell with no value and no style). */
export const SHEET_6A1: (ExpectedCell | null)[][] = [
  [
    ['THỜI KHÓA BIỂU NĂM HỌC 2026 - 2027', 'title'],
    ...Array<ExpectedCell>(6).fill([null, 'title']),
  ],
  [
    ['SCHOOL SCHEDULE 2026 - 2027', 'titleEnglish'],
    ...Array<ExpectedCell>(6).fill([null, 'titleEnglish']),
  ],
  [
    ['(Áp dụng từ ngày 03/09/2026)', 'appliesFrom'],
    ...Array<ExpectedCell>(6).fill([null, 'appliesFrom']),
  ],
  [],
  [
    ['Trường/School: Trung học/Secondary School', 'label'],
    null,
    null,
    [{ formula: "'Data '!I6", result: 'GVCN/Form Teacher:' }, 'labelCentred'],
    [{ formula: lookup(2), result: 'Lương Thị Ngân' }, 'value'],
    ['SĐT', 'labelCentred'],
    [{ formula: lookup(4), result: '0912 345 678' }, 'valueCentred'],
  ],
  [
    ['Lớp/Class: ', 'label'],
    null,
    ['6A1', 'valueCentred'],
    ['Email:', 'labelCentred'],
    [{ formula: lookup(6), result: 'ngan.lt@example.com' }, 'value'],
    [null, 'value'],
  ],
  [],
  [
    ['Tiết/\nPeriod', 'head'],
    ['Thời gian/\nTime', 'head'],
    ['Thứ hai/ Monday', 'head'],
    ['Thứ ba/ Tuesday', 'head'],
    ['Thứ tư/ Wednesday', 'head'],
    ['Thứ Năm/ Thursday', 'head'],
    ['Thứ Sáu/ Friday', 'head'],
  ],
  breakRow('7:00 - 7:50', 'Đón học sinh, ăn sáng / Breakfast'),
  [
    [null, 'fixedText'],
    ['7:50 - 8:00', 'head'],
    ['Chào cờ', 'fixedText'],
    ['Hoạt động đầu ngày/Getting ready', 'fixedText'],
    [null, 'fixedText'],
    [null, 'fixedText'],
    [null, 'fixedText'],
  ],
  [
    ['1-2', 'blockLabel'],
    ['8:00 - 9:10', 'head'],
    [{ formula: into('F5'), result: 'Toán' }, 'slot'],
    [{ formula: into('F22'), result: 'Tiếng Anh' }, 'slot'],
    [{ formula: into('F39'), result: 'Tin học (first half)' }, 'slot'],
    [{ formula: into('F56'), result: 'Ngữ văn' }, 'slot'],
    [{ formula: into('F73'), result: '' }, 'slot'],
  ],
  breakRow('9:10 - 9:20', 'Giờ chơi/ Break'),
  [
    ['3-4', 'blockLabel'],
    ['9:20 - 10:30', 'head'],
    [{ formula: into('F8'), result: 'Ngữ văn' }, 'slot'],
    [{ formula: into('F25'), result: '' }, 'slot'],
    [{ formula: into('F42'), result: 'Toán' }, 'slot'],
    [{ formula: into('F59'), result: '' }, 'slot'],
    [{ formula: into('F76'), result: '' }, 'slot'],
  ],
  breakRow('10:30 - 10:40', 'Giờ chơi/ Break'),
  [
    ['5-6', 'blockLabel'],
    ['10:40 - 11:50', 'head'],
    [{ formula: into('F11'), result: '' }, 'slot'],
    [{ formula: into('F28'), result: '' }, 'slot'],
    [{ formula: into('F45'), result: '' }, 'slot'],
    [{ formula: into('F62'), result: '' }, 'slot'],
    [{ formula: into('F79'), result: 'Tin học (second half)' }, 'slot'],
  ],
  breakRow('11:50 - 13:20', 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time'),
  [
    ['7-8', 'blockLabel'],
    ['13:20 - 14:30', 'head'],
    [{ formula: into('F14'), result: '' }, 'slot'],
    [{ formula: into('F31'), result: 'Thể dục' }, 'slot'],
    [{ formula: into('F48'), result: '' }, 'slot'],
    [{ formula: into('F65'), result: 'Toán phân hoá/ Ngoại ngữ 2' }, 'slot'],
    [{ formula: into('F82'), result: '' }, 'slot'],
  ],
  breakRow('14:30 - 14:50', 'Ăn nhẹ/Snack time'),
  [
    ['9-10', 'blockLabel'],
    ['14:50 - 16:00', 'head'],
    [{ formula: into('F17'), result: '' }, 'slot'],
    [{ formula: into('F34'), result: '' }, 'slot'],
    [{ formula: into('F51'), result: '' }, 'slot'],
    [{ formula: into('F68'), result: '' }, 'slot'],
    [{ formula: into('F85'), result: 'SH lớp + GDPC' }, 'slot'],
  ],
  breakRow('16:00', 'Kết thúc / Finish'),
];

// --- TKB tổng hợp ---

export const GRID_COLUMNS = [10.71, 9.14, 5.29, 15.43, 21.71, 27.86];
export const GRID_HEIGHTS = { head: [51, 36], fixed: 42, subject: 69.75, teacher: 57 };
export const GRID_VIEW = { state: 'frozen', xSplit: 5, ySplit: 2, zoomScale: 70 };
export const GRID_PAGE = { paperSize: 9, orientation: 'portrait' };

export const GRID_HEAD: ExpectedCell[] = [
  ['Thứ\nDay', 'gridHead'],
  [null, 'gridHead'],
  [' ', 'gridHead'],
  ['Tiết\nPeriod', 'gridHeadSmall'],
  ['Thời gian\nTime', 'gridHeadSmall'],
  ...['6A1', '6A2', '7AA1', '8CE1', '9B1', '9BA1'].map((n): ExpectedCell => [n, 'gridClass']),
];

export const GRID_DAYS = [
  ['Thứ Hai / Monday', 'Th2', 'T2'],
  ['Thứ Ba / Tuesday', 'Th3', 'T3'],
  ['Thứ Tư / Wednesday', 'Th4', 'T4'],
  ['Thứ Năm / Thursday', 'Th5', 'T5'],
  ['Thứ Sáu / Friday', 'Th6', 'T6'],
] as const;

/** Each day's 17 rows, the same on every day: a fixed row's time and text, or a block's
    period code and time over its teacher row. */
export const GRID_DAY_ROWS = [
  ['fixed', '7:00 - 7:50', 'Ăn sáng/ Breakfast'],
  ['fixed', '7:50 - 8:00', 'Chào cờ/ Hoạt động đầu ngày'],
  ['subject', 'THCS12', '8:00 - 9:10'],
  ['teacher'],
  ['fixed', '9:10 - 9:20', 'Giờ chơi/ Break'],
  ['subject', 'THCS34', '9:20 - 10:30'],
  ['teacher'],
  ['fixed', '10:30 - 10:40', 'Giờ chơi/ Break'],
  ['subject', 'THCS56', '10:40 - 11:50'],
  ['teacher'],
  ['fixed', '11:50 - 13:20', 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time'],
  ['subject', 'THCS78', '13:20 - 14:30'],
  ['teacher'],
  ['fixed', '14:30 - 14:50', 'Ăn nhẹ/ Snack time'],
  ['subject', 'THCS910', '14:50 - 16:00'],
  ['teacher'],
  ['fixed', '16:00', 'Kết thúc/ Finish'],
] as const;

/** Every filled block, as "class day period" (day 0 is Monday, the period code as in
    `HK1`), with its subject and teacher. Every other class cell is empty. */
export const GRID_SLOTS: Record<string, [subject: string, teacher: string]> = {
  '6A1 0 THCS12': ['Toán', 'Thầy Phúc'],
  '6A1 0 THCS34': ['Ngữ văn', 'Cô Ngân'],
  '6A1 1 THCS12': ['Tiếng Anh', 'Cô Vy'],
  '6A1 1 THCS78': ['Thể dục', 'Thầy Tùng'],
  '6A1 2 THCS12': ['Tin học (first half)', 'Thầy Hiếu'],
  '6A1 2 THCS34': ['Toán', 'Thầy Phúc'],
  '6A1 3 THCS12': ['Ngữ văn', 'Cô Ngân'],
  '6A1 3 THCS78': ['Toán phân hoá/ Ngoại ngữ 2', 'Thầy Phúc'],
  '6A1 4 THCS56': ['Tin học (second half)', 'Thầy Hiếu'],
  // Two halves, both Cô Ngân's, so her name once.
  '6A1 4 THCS910': ['SH lớp + GDPC', 'Cô Ngân'],
  '6A2 0 THCS34': ['Ngữ văn', 'Cô Ngân'],
  '6A2 1 THCS12': ['Toán', 'Thầy Quân'],
  '6A2 2 THCS56': ['Tiếng Anh', 'Cô Vy'],
  '6A2 2 THCS78': ['Toán', 'Thầy Quân'],
  '7AA1 0 THCS12': ['Toán', 'Thầy Quân'],
  '7AA1 2 THCS78': ['KHTN - Lý', 'Thầy Đạt'],
  '7AA1 2 THCS910': ['KHTN - Lý', 'Thầy Đạt'],
  '7AA1 3 THCS56': ['Lịch sử', 'Cô Trâm'],
  '7AA1 3 THCS910': ['SH lớp (first half)', 'Cô Ngân'],
  '7AA1 4 THCS56': ['Tin học (first half)', 'Thầy Hiếu'],
  // A card with no teacher.
  '7AA1 4 THCS910': ['SH lớp (first half)', ''],
  '8CE1 1 THCS12': ['Tiếng Anh + Lịch sử', 'Cô Trâm'],
  '8CE1 3 THCS34': ['Lịch sử', 'Cô Trâm'],
};

// --- Data ---

export const DATA_COLUMNS = { first: 8, widths: [14.43, 28.71, 26.29, 16.43, 16.43, 44.43, 28.57] };

/** From H6: the header, then a row per class. */
export const DATA_ROWS = [
  ['Lớp', 'GVCN/Form Teacher:', 'PCN/Co-teacher', 'Mob CN', 'Mob PCN', 'Email CN', 'Email PCN'],
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
  ['7AA1', 'Kha Minh Đạt', 'Ứng Ngọc Trâm', '', '024 3826 1234', '', ''],
  [
    '8CE1',
    'Ứng Ngọc Trâm',
    'Lạc Thảo Vy',
    '024 3826 1234',
    '+84 903 111 222',
    '',
    'vy.lt@example.com',
  ],
  ['9B1', 'Thầy Hiếu', '', '', '', '', ''],
  ['9BA1', '', '', '', '', '', ''],
];

// --- Giáo viên ---

export const TEACHER_COLUMN_WIDTHS = [6, 32.71, 31.14, 31.14, 56.43, 22, 22];
export const TEACHER_HEAD_HEIGHT = 33;

export const TEACHER_HEADER_ROW = [
  'TT',
  'Họ tên/ Full name',
  'Tên ngắn/ Short name',
  'Điện thoại/ Phone',
  'Email',
  'Trường dạy chính/ Home school',
  'Trường kiêm nhiệm/ Also teaches at',
];

/** From A2, in teacher-list order, without the TT column. */
export const TEACHER_ROWS: Record<string, string[]> = {
  'Cô Ngân': ['Lương Thị Ngân', 'Cô Ngân', '0912 345 678', 'ngan.lt@example.com', 'THCS', ''],
  // At both schools: home at THCS, and also at THPT.
  'Thầy Phúc': ['Tạ Văn Phúc', 'Thầy Phúc', '', 'phuc.tv@example.com', 'THCS', 'THPT'],
  'Thầy Quân': ['Ông Đức Quân', 'Thầy Quân', '0987 654 321', '', 'THCS', ''],
  'Cô Vy': ['Lạc Thảo Vy', 'Cô Vy', '+84 903 111 222', 'vy.lt@example.com', '', ''],
  'Thầy Đạt': ['Kha Minh Đạt', 'Thầy Đạt', '', '', 'THPT', ''],
  'Cô Trâm': ['Ứng Ngọc Trâm', 'Cô Trâm', '024 3826 1234', '', '', ''],
  // No full name: this sheet leaves it empty, where `Data ` has the short name stand in.
  'Thầy Hiếu': ['', 'Thầy Hiếu', '', '', '', ''],
  'Thầy Tùng': ['Mạc Thanh Tùng', 'Thầy Tùng', '', '', '', ''],
};
