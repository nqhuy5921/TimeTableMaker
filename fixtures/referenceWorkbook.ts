import ExcelJS from 'exceljs';
import { exportClassIds } from '../src/domain/exportDetails';
import {
  dataSheet,
  dayCode,
  GRID_DAY_NAMES,
  gridSheet,
  shortDayCode,
  slotText,
  teacherSheet,
} from '../src/domain/exportSheets';
import type { WorkbookData } from '../src/domain/importWorkbook';
import { DAYS, type BlockIndex } from '../src/domain/model';
import { exampleSchool } from '../src/domain/exampleSchool';

// The school's workbook layout with the made-up sample school in it (SYSTEM_DESIGN §12.8):
// `ID GV 1S`, `Data `, `Phan cong`, and `HK1`, shaped as R5-0 measured them, with no data
// from the real workbook. Importing it gives the sample school with no rooms, and one extra
// teacher who teaches nothing, as the school's list has high-school teachers.

type Cell = string | number | { formula: string; result: string };
type Sheet = { name: string; rows: Cell[][] };

const BLOCKS: readonly BlockIndex[] = [0, 1, 2, 3, 4];
const school = exampleSchool;
const classIds = exportClassIds(school, 'all', '');
const classNames = classIds.map((id) => school.classes.find((c) => c.id === id)!.name);

/** A mobile `ID GV 1S` has saved as a number, losing its leading 0. */
const phoneCell = (cell: Cell): Cell => (cell === '0912 345 678' ? 912345678 : cell);

function teachersSheet(): Sheet {
  const rows: Cell[][] = teacherSheet(school, classIds).rows.map((row) => [
    ...row.map(phoneCell),
    'Giáo viên',
  ]);
  rows.push([rows.length + 1, 'Phạm Giả Định', 'Cô Giả Định', '', '', 'THPT', '', 'Giáo viên']);
  return {
    name: 'ID GV 1S',
    rows: [
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
      ...rows,
    ],
  };
}

const INDENT: Cell[] = Array<Cell>(7).fill('');

/** `Data `: the header at H6, under a row of column numbers, naming teachers by full name. */
function dataRowsSheet(): Sheet {
  const data = dataSheet(school, classIds);
  return {
    name: 'Data ',
    rows: [
      [],
      [],
      [],
      [],
      [...INDENT, ...data.header.map((_, i) => i + 1)],
      [...INDENT, ...data.header],
      ...data.rows.map((row) => [...INDENT, ...row]),
    ],
  };
}

const subjectNames = school.subjects.map((s) => s.name);

/** The teacher `Phan cong` has for a class and subject: the first placed there. */
function assignedTeacher(classId: string, subject: string): string {
  for (const day of DAYS) {
    for (const block of BLOCKS) {
      const slot = slotText(school, classId, day, block);
      if (slot.subject === subject && slot.teacher !== '') return slot.teacher;
    }
  }
  return '';
}

/** `Phan cong`: a row per class, a column per subject named as in `HK1`, then the homeroom
    teacher and co-teacher by short name. */
function assignmentsSheet(): Sheet {
  const shortName = (id: string | undefined) =>
    school.teachers.find((t) => t.id === id)?.shortName ?? '';
  return {
    name: 'Phan cong',
    rows: [
      [],
      ['TT', 'Lớp', ...subjectNames, 'GVCN', 'PCN'],
      ...classIds.map((id, index) => {
        const schoolClass = school.classes.find((c) => c.id === id)!;
        return [
          index + 1,
          schoolClass.name,
          ...subjectNames.map((subject) => assignedTeacher(id, subject)),
          shortName(schoolClass.formTeacherId),
          shortName(schoolClass.coTeacherId),
        ];
      }),
    ],
  };
}

const HEAD = ['Thứ\nDay', '', '', 'Tiết\nPeriod', 'Thời gian\nTime'];

/** A teacher cell as `HK1` has it: an `HLOOKUP` into `Phan cong` with its value saved, or
    typed when the block isn't a subject `Phan cong` has a column for. */
function teacherCell(subject: string, teacher: string, classIndex: number): Cell {
  if (teacher === '' || !subjectNames.includes(subject)) return teacher;
  const column = String.fromCharCode('C'.charCodeAt(0) + subjectNames.indexOf(subject));
  return {
    formula: `HLOOKUP("${subject}",'Phan cong'!$${column}$2:$${column}$8,${classIndex + 2},0)`,
    result: teacher,
  };
}

/** `HK1`: the class names, then "Tiết" and the same names again over counting columns; each
    day's fixed rows, and each block's subject row with its teacher row under it. */
function gridRowsSheet(): Sheet {
  const grid = gridSheet(school, classIds);
  const rows: Cell[][] = [
    [...HEAD, ...classNames, 'Tiết', ...classNames],
    ['', '', '', '', '', ...classNames.map((_, i) => i + 2)],
  ];
  grid.rows.forEach((row, index) => {
    const start: Cell[] = [GRID_DAY_NAMES[row.day], dayCode(row.day), shortDayCode(row.day)];
    switch (row.kind) {
      case 'fixed':
        rows.push([...start, '', row.time, ...classNames.map(() => row.text)]);
        break;
      case 'subject':
        rows.push([
          ...start,
          row.periodCode,
          row.time,
          ...row.cells,
          12,
          ...row.cells.map(() => 0),
        ]);
        break;
      case 'teacher': {
        const subjects = grid.rows[index - 1];
        const cells = row.cells.map((teacher, classIndex) =>
          teacherCell(
            subjects?.kind === 'subject' ? (subjects.cells[classIndex] ?? '') : '',
            teacher,
            classIndex,
          ),
        );
        rows.push([...start, '', '', ...cells]);
        break;
      }
    }
  });
  return { name: 'HK1', rows };
}

function referenceSheets(): Sheet[] {
  return [
    { name: 'TIMETABLE', rows: [['Tiết', 'Thời gian']] },
    teachersSheet(),
    dataRowsSheet(),
    assignmentsSheet(),
    gridRowsSheet(),
  ];
}

const cellText = (cell: Cell | undefined): string =>
  typeof cell === 'object' ? cell.result : cell === undefined ? '' : String(cell).trim();

/** Without trailing empty cells, as a read sheet's rows are. */
function readRow(row: readonly Cell[]): string[] {
  const texts = row.map(cellText);
  while (texts.at(-1) === '') texts.pop();
  return texts;
}

/** The reference workbook as the main process reads it (SYSTEM_DESIGN §12.1). */
export function referenceWorkbookData(): WorkbookData {
  return {
    fileName: 'TKB reference.xlsx',
    sheets: referenceSheets().map((s) => ({
      name: s.name,
      hidden: false,
      rows: s.rows.map(readRow),
    })),
  };
}

/** The same workbook as an .xlsx, with `HK1`'s teacher cells as formulas with saved values. */
export function referenceWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of referenceSheets()) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell !== '') ws.getCell(r + 1, c + 1).value = cell;
      });
    });
  }
  return workbook;
}
