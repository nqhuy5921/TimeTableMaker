import ExcelJS from 'exceljs';
import {
  classSheet,
  DATA_HEADER,
  DATA_LOOKUP_COLUMNS,
  dataSheet,
  dayCode,
  EXPORT_LABELS,
  GRID_DAY_NAMES,
  GRID_HEADER,
  gridRowIndex,
  gridSheet,
  shortDayCode,
  teacherSheet,
  type ClassSheet,
  type DataSheet,
  type ExportDetails,
  type GridSheet,
  type TeacherSheet,
} from '../domain/exportSheets';
import { DAYS, type Day, type Id, type TimetableFile } from '../domain/model';
import { charCount, columnLetters } from '../domain/text';

// The Excel export (IE-2, SYSTEM_DESIGN §11.3): the export model's sheets written as a
// workbook laid out like the school's sample. The class sheets come first, in class-bar
// order, then `TKB tổng hợp`, `Data `, and `Giáo viên`. A class sheet's subject cells are formulas into
// `TKB tổng hợp`, and its header's homeroom name, phone, and email are VLOOKUPs into `Data `,
// as the sample's are; each formula is written with its result, so Excel and LibreOffice
// show every value before recalculating. Sizes and styles were measured from the sample's
// `6A1`, `HK1`, `Data `, and `ID GV 1S` sheets; they're the exported file's own styles, not the app's.

/** Where the class sheet's grid starts: the day header row, and the first schedule row. */
export const CLASS_SHEET_HEADER_ROW = 8;
/** `TKB tổng hợp`: two header rows (the sample's second held HLOOKUP column numbers), so
    Monday's first block is row 5, as in the sample's `HK1`. */
export const GRID_FIRST_ROW = 3;
/** The grid sheet's first class column, F, after the day, its two codes, period, and time. */
export const GRID_FIRST_CLASS_COLUMN = 6;
/** `Data `'s table starts at H6, as the sample's does, with a row per class under it. */
export const DATA_FIRST_COLUMN = 8;
export const DATA_HEADER_ROW = 6;

// --- Styles ---

const BLACK = { argb: 'FF000000' };
const SERIF = 'Cambria';

const font = (size: number, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: SERIF,
  size,
  color: BLACK,
  ...extra,
});

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: BLACK };
const BOX: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};

/** The sample's light orange: the class sheets' header, period, time, and fixed rows, and
    `HK1`'s period and time columns. */
const ORANGE = 'FFFBD4B4';

interface CellStyle {
  font: Partial<ExcelJS.Font>;
  fill?: ExcelJS.Fill;
  border?: Partial<ExcelJS.Borders>;
  alignment: Partial<ExcelJS.Alignment>;
  numFmt?: string;
}

const DATA_CELL: CellStyle = {
  font: { name: 'Times New Roman', size: 12, color: BLACK },
  border: BOX,
  alignment: { vertical: 'middle', wrapText: true },
};

/** Every cell style the workbook uses, by what the cell is. */
export const STYLES = {
  // Class sheets.
  title: { font: font(16, { bold: true }), alignment: { horizontal: 'center', vertical: 'top' } },
  titleEnglish: { font: font(16, { italic: true }), alignment: { horizontal: 'center' } },
  appliesFrom: { font: font(12, { italic: true }), alignment: { horizontal: 'center' } },
  label: { font: font(11), alignment: { horizontal: 'left', vertical: 'middle' } },
  labelCentred: { font: font(11), alignment: { horizontal: 'center', vertical: 'middle' } },
  value: { font: font(11, { bold: true }), alignment: { horizontal: 'left', vertical: 'middle' } },
  valueCentred: {
    font: font(11, { bold: true }),
    alignment: { horizontal: 'center', vertical: 'middle' },
  },
  head: { font: font(11), fill: solid(ORANGE), border: BOX, alignment: CENTER },
  /** Block labels are text ("1-2"), so Excel doesn't read them as dates. */
  blockLabel: { font: font(11), fill: solid(ORANGE), border: BOX, alignment: CENTER, numFmt: '@' },
  fixedText: {
    font: font(11, { italic: true }),
    fill: solid(ORANGE),
    border: BOX,
    alignment: CENTER,
  },
  slot: { font: font(11), border: BOX, alignment: CENTER },
  // TKB tổng hợp.
  gridHead: {
    font: font(24, { bold: true }),
    fill: solid('FF92CDDC'),
    border: BOX,
    alignment: CENTER,
  },
  gridHeadSmall: {
    font: font(18, { bold: true }),
    fill: solid('FF92CDDC'),
    border: BOX,
    alignment: CENTER,
  },
  gridClass: {
    font: font(18, { bold: true }),
    fill: solid('FFE36C09'),
    border: BOX,
    alignment: CENTER,
  },
  /** The day name and its code, turned on their side as in `HK1` (R4-8 review). */
  gridDay: {
    font: font(24, { bold: true }),
    fill: solid('FFD99594'),
    border: BOX,
    alignment: { ...CENTER, textRotation: 90 },
  },
  gridShortDay: {
    font: { name: 'Times New Roman', size: 10, bold: true, color: BLACK },
    fill: solid('FF4F81BD'),
    border: BOX,
    alignment: CENTER,
  },
  gridPeriod: { font: font(18), fill: solid(ORANGE), border: BOX, alignment: CENTER, numFmt: '@' },
  /** A fixed row's text, merged across the class columns and starting at the first, so it
      runs across with no borders between classes as in `HK1`, never cut off at the first
      column's edge (R4-8 review). */
  gridFixed: {
    font: font(18, { bold: true, italic: true }),
    fill: solid('FFB2A1C7'),
    border: BOX,
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 },
  },
  gridSubject: { font: font(18, { bold: true }), border: BOX, alignment: CENTER },
  /** The sample's teacher rows are red. */
  gridTeacher: {
    font: font(18, { color: { argb: 'FFFF0000' } }),
    border: BOX,
    alignment: CENTER,
  },
  // Data.
  dataHead: { font: font(12, { bold: true }), border: BOX, alignment: CENTER },
  dataCell: DATA_CELL,
  /** Text that must stay text, as a phone's leading 0 must. */
  dataText: { ...DATA_CELL, numFmt: '@' },
} satisfies Record<string, CellStyle>;

function styleCell(cell: ExcelJS.Cell, style: CellStyle): void {
  cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.border) cell.border = style.border;
  cell.alignment = style.alignment;
  if (style.numFmt) cell.numFmt = style.numFmt;
}

/** Writes a value and a style; a range is merged, and every cell in it gets the style so
    its borders draw in Excel and LibreOffice alike. */
function put(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  value: ExcelJS.CellValue,
  style: CellStyle,
  lastColumn = column,
): void {
  for (let c = column; c <= lastColumn; c++) styleCell(sheet.getCell(row, c), style);
  if (lastColumn > column) sheet.mergeCells(row, column, row, lastColumn);
  sheet.getCell(row, column).value = value;
}

/** A sheet name as a formula writes it: quoted, with any quote doubled. */
const sheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** A formula with its result cached, so the value shows before anything recalculates.
    `&""` makes an empty cell read as empty text, where a plain reference would show 0. */
const textFormula = (formula: string, result: string): ExcelJS.CellFormulaValue => ({
  formula: `${formula}&""`,
  result,
});

// --- Class sheet ---

const CLASS_COLUMN_WIDTHS = [7.71, 15.29, 25.71, 25.71, 25.71, 25.71, 25.71];
const CLASS_ROW_HEIGHTS: Record<number, number> = { 1: 21.6, 2: 22.35, 3: 18.6, 4: 9.75, 7: 9 };
const CLASS_HEAD_HEIGHT = 28.5;
const CLASS_FIXED_HEIGHT = 16.5;
const CLASS_BLOCK_HEIGHT = 45;
/** Columns C to G hold Monday to Friday. */
const dayColumn = (day: Day) => 3 + day;
const LAST_CLASS_COLUMN = dayColumn(4);

/** The sample's print setup: A4 landscape, on one page. */
const CLASS_PAGE_SETUP: Partial<ExcelJS.PageSetup> = {
  paperSize: 9,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
};

interface Lookups {
  grid: GridSheet;
  data: DataSheet;
}

function writeClassSheet(
  workbook: ExcelJS.Workbook,
  sheet: ClassSheet,
  classId: Id,
  { grid, data }: Lookups,
): void {
  const ws = workbook.addWorksheet(sheet.name, {
    pageSetup: CLASS_PAGE_SETUP,
    views: [{ zoomScale: 85 }],
  });
  CLASS_COLUMN_WIDTHS.forEach((width, i) => (ws.getColumn(i + 1).width = width));
  for (const [row, height] of Object.entries(CLASS_ROW_HEIGHTS)) {
    ws.getRow(Number(row)).height = height;
  }

  put(ws, 1, 1, sheet.title[0], STYLES.title, LAST_CLASS_COLUMN);
  put(ws, 2, 1, sheet.title[1], STYLES.titleEnglish, LAST_CLASS_COLUMN);
  put(ws, 3, 1, sheet.title[2], STYLES.appliesFrom, LAST_CLASS_COLUMN);

  // The header: the school, the class, and its homeroom teacher, looked up in `Data `.
  const dataName = sheetRef(data.name);
  const dataLast = DATA_FIRST_COLUMN + DATA_HEADER.length - 1;
  const dataRange =
    `${dataName}!$${columnLetters(DATA_FIRST_COLUMN)}$${DATA_HEADER_ROW}:` +
    `$${columnLetters(dataLast)}$${DATA_HEADER_ROW + data.rows.length}`;
  const lookup = (column: number) => `VLOOKUP(C6,${dataRange},${column},0)`;
  const homeroomLabel = `${dataName}!${columnLetters(DATA_FIRST_COLUMN + 1)}${DATA_HEADER_ROW}`;
  put(ws, 5, 1, sheet.school, STYLES.label);
  put(ws, 5, 4, { formula: homeroomLabel, result: EXPORT_LABELS.homeroom }, STYLES.labelCentred);
  put(
    ws,
    5,
    5,
    textFormula(lookup(DATA_LOOKUP_COLUMNS.fullName), sheet.homeroom.fullName),
    STYLES.value,
  );
  put(ws, 5, 6, EXPORT_LABELS.phone, STYLES.labelCentred);
  put(
    ws,
    5,
    7,
    textFormula(lookup(DATA_LOOKUP_COLUMNS.phone), sheet.homeroom.phone),
    STYLES.valueCentred,
  );
  put(ws, 6, 1, EXPORT_LABELS.class, STYLES.label);
  put(ws, 6, 3, sheet.name, STYLES.valueCentred);
  put(ws, 6, 4, EXPORT_LABELS.email, STYLES.labelCentred);
  put(
    ws,
    6,
    5,
    textFormula(lookup(DATA_LOOKUP_COLUMNS.email), sheet.homeroom.email),
    STYLES.value,
    6,
  );

  // The day header, then the bell schedule's rows.
  const head = CLASS_SHEET_HEADER_ROW;
  ws.getRow(head).height = CLASS_HEAD_HEIGHT;
  put(ws, head, 1, EXPORT_LABELS.period, STYLES.head);
  put(ws, head, 2, EXPORT_LABELS.time, STYLES.head);
  for (const day of DAYS) put(ws, head, dayColumn(day), EXPORT_LABELS.days[day], STYLES.head);

  const gridName = sheetRef(grid.name);
  const gridColumn = columnLetters(GRID_FIRST_CLASS_COLUMN + grid.classIds.indexOf(classId));
  sheet.rows.forEach((row, i) => {
    const r = head + 1 + i;
    if (row.kind === 'block') {
      ws.getRow(r).height = CLASS_BLOCK_HEIGHT;
      put(ws, r, 1, row.label, STYLES.blockLabel);
      put(ws, r, 2, row.time, STYLES.head);
      for (const day of DAYS) {
        const gridRow = GRID_FIRST_ROW + gridRowIndex(grid, day, row.block);
        const formula = `${gridName}!${gridColumn}${gridRow}`;
        put(ws, r, dayColumn(day), textFormula(formula, row.subjects[day] ?? ''), STYLES.slot);
      }
      return;
    }
    ws.getRow(r).height = CLASS_FIXED_HEIGHT;
    put(ws, r, 1, null, STYLES.fixedText);
    put(ws, r, 2, row.time, STYLES.head);
    for (const span of row.spans) {
      put(ws, r, dayColumn(span.firstDay), span.text, STYLES.fixedText, dayColumn(span.lastDay));
    }
  });
}

// --- TKB tổng hợp ---

const GRID_COLUMN_WIDTHS = [10.71, 9.14, 5.29, 15.43, 21.71];
const GRID_CLASS_WIDTH = 27.86;
const GRID_HEAD_HEIGHTS = [51, 36];
const GRID_HEIGHTS = { fixed: 42, subject: 69.75, teacher: 57 } as const;
/** A line of the grid's 18pt text. */
const GRID_LINE_HEIGHT = 23;

/** A fixed row's height: the sample's, which holds two lines, or tall enough for its text
    across the class columns when that needs more, as the lunch row does in a This class
    export's one column (R4-8 review). Column widths count 11pt characters, the text is
    18pt, and the indent takes two. */
export function gridFixedHeight(text: string, classCount: number): number {
  const perLine = Math.floor((GRID_CLASS_WIDTH * classCount * 11) / 18) - 2;
  const lines = Math.ceil(charCount(text) / perLine);
  return lines <= 2 ? GRID_HEIGHTS.fixed : lines * GRID_LINE_HEIGHT;
}

function writeGridSheet(workbook: ExcelJS.Workbook, grid: GridSheet): void {
  const ws = workbook.addWorksheet(grid.name, {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
    views: [{ state: 'frozen', xSplit: GRID_FIRST_CLASS_COLUMN - 1, ySplit: 2, zoomScale: 70 }],
  });
  GRID_COLUMN_WIDTHS.forEach((width, i) => (ws.getColumn(i + 1).width = width));
  const lastColumn = GRID_FIRST_CLASS_COLUMN + grid.classNames.length - 1;
  for (let c = GRID_FIRST_CLASS_COLUMN; c <= lastColumn; c++) {
    ws.getColumn(c).width = GRID_CLASS_WIDTH;
  }

  // The header: the day, its two codes, the period, the time, and the classes, each over
  // both header rows.
  GRID_HEAD_HEIGHTS.forEach((height, i) => (ws.getRow(i + 1).height = height));
  const [dayHead, codeHead, periodHead, timeHead] = GRID_HEADER;
  const heads: [string | null, CellStyle][] = [
    [dayHead, STYLES.gridHead],
    [null, STYLES.gridHead],
    [codeHead, STYLES.gridHead],
    [periodHead, STYLES.gridHeadSmall],
    [timeHead, STYLES.gridHeadSmall],
    ...grid.classNames.map((name): [string, CellStyle] => [name, STYLES.gridClass]),
  ];
  heads.forEach(([text, style], i) => {
    styleCell(ws.getCell(1, i + 1), style);
    styleCell(ws.getCell(2, i + 1), style);
    ws.mergeCells(1, i + 1, 2, i + 1);
    ws.getCell(1, i + 1).value = text;
  });

  // Day by day, its name down column A beside its rows.
  const dayStart = new Map<Day, number>();
  grid.rows.forEach((row, i) => {
    const r = GRID_FIRST_ROW + i;
    if (!dayStart.has(row.day)) dayStart.set(row.day, r);
    ws.getRow(r).height =
      row.kind === 'fixed'
        ? gridFixedHeight(row.text, grid.classNames.length)
        : GRID_HEIGHTS[row.kind];
    styleCell(ws.getCell(r, 1), STYLES.gridDay);
    put(ws, r, 2, dayCode(row.day), STYLES.gridDay);
    put(ws, r, 3, shortDayCode(row.day), STYLES.gridShortDay);
    if (row.kind === 'fixed') {
      put(ws, r, 4, null, { ...STYLES.gridPeriod, font: font(18, { italic: true }) });
      put(ws, r, 5, row.time, STYLES.gridPeriod);
      put(ws, r, GRID_FIRST_CLASS_COLUMN, row.text, STYLES.gridFixed, lastColumn);
      return;
    }
    const subject = row.kind === 'subject';
    put(ws, r, 4, subject ? row.periodCode : null, STYLES.gridPeriod);
    put(ws, r, 5, subject ? row.time : null, STYLES.gridPeriod);
    row.cells.forEach((text, i) => {
      put(
        ws,
        r,
        GRID_FIRST_CLASS_COLUMN + i,
        text === '' ? null : text,
        subject ? STYLES.gridSubject : STYLES.gridTeacher,
      );
    });
  });
  const lastRow = GRID_FIRST_ROW + grid.rows.length - 1;
  for (const day of DAYS) {
    const start = dayStart.get(day);
    if (start === undefined) continue;
    const end = DAYS.slice(day + 1)
      .map((d) => dayStart.get(d))
      .find((r) => r !== undefined);
    ws.mergeCells(start, 1, (end ?? lastRow + 1) - 1, 1);
    ws.getCell(start, 1).value = GRID_DAY_NAMES[day];
  }
}

// --- Data ---

const DATA_COLUMN_WIDTHS = [14.43, 28.71, 26.29, 16.43, 16.43, 44.43, 28.57];

function writeDataSheet(workbook: ExcelJS.Workbook, data: DataSheet): void {
  const ws = workbook.addWorksheet(data.name);
  DATA_COLUMN_WIDTHS.forEach((width, i) => (ws.getColumn(DATA_FIRST_COLUMN + i).width = width));
  data.header.forEach((text, i) =>
    put(ws, DATA_HEADER_ROW, DATA_FIRST_COLUMN + i, text, STYLES.dataHead),
  );
  data.rows.forEach((row, r) =>
    row.forEach((text, i) =>
      put(
        ws,
        DATA_HEADER_ROW + 1 + r,
        DATA_FIRST_COLUMN + i,
        text === '' ? null : text,
        STYLES.dataText,
      ),
    ),
  );
}

// --- Giáo viên ---

// `ID GV 1S`'s widths where it sets them, with the school columns wide enough for their
// two-line headers.
const TEACHER_COLUMN_WIDTHS = [6, 32.71, 31.14, 31.14, 56.43, 22, 22];
const TEACHER_HEAD_HEIGHT = 33;

function writeTeacherSheet(workbook: ExcelJS.Workbook, teachers: TeacherSheet): void {
  const ws = workbook.addWorksheet(teachers.name);
  TEACHER_COLUMN_WIDTHS.forEach((width, i) => (ws.getColumn(i + 1).width = width));
  ws.getRow(1).height = TEACHER_HEAD_HEIGHT;
  teachers.header.forEach((text, i) => put(ws, 1, i + 1, text, STYLES.dataHead));
  teachers.rows.forEach((row, r) =>
    row.forEach((value, i) =>
      put(
        ws,
        r + 2,
        i + 1,
        value === '' ? null : value,
        typeof value === 'number' ? STYLES.dataCell : STYLES.dataText,
      ),
    ),
  );
}

// --- Workbook ---

/** The workbook for the classes asked for, in the order given (class-bar order). */
export function buildWorkbook(
  file: TimetableFile,
  classIds: readonly Id[],
  details: ExportDetails,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TimeTableMaker';
  const lookups: Lookups = { grid: gridSheet(file, classIds), data: dataSheet(file, classIds) };
  for (const classId of classIds) {
    writeClassSheet(workbook, classSheet(file, classId, details), classId, lookups);
  }
  writeGridSheet(workbook, lookups.grid);
  writeDataSheet(workbook, lookups.data);
  writeTeacherSheet(workbook, teacherSheet(file, classIds));
  return workbook;
}

/** The workbook as the bytes of an `.xlsx` file. */
export async function workbookBytes(
  file: TimetableFile,
  classIds: readonly Id[],
  details: ExportDetails,
): Promise<Buffer> {
  const bytes = await buildWorkbook(file, classIds, details).xlsx.writeBuffer();
  return Buffer.from(bytes);
}
