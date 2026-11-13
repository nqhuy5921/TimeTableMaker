import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASS_HEADERS,
  CLASS_SHEET_COLUMNS,
  CLASS_SHEET_HEIGHTS,
  CLASS_SHEET_MERGES,
  CLASS_SHEET_PAGE,
  DATA_COLUMNS,
  DATA_ROWS,
  EXPECTED_SHEET_NAMES,
  EXPECTED_STYLES,
  EXPORT_DETAILS,
  GRID_COLUMNS,
  GRID_DAY_ROWS,
  GRID_DAYS,
  GRID_HEAD,
  GRID_HEIGHTS,
  GRID_PAGE,
  GRID_SLOTS,
  GRID_VIEW,
  SHEET_6A1,
  TEACHER_COLUMN_WIDTHS,
  TEACHER_HEAD_HEIGHT,
  TEACHER_HEADER_ROW,
  TEACHER_ROWS,
  type ExpectedCell,
} from '../../fixtures/expectedWorkbook';
import { SAMPLE_CLASSES } from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { EXAMPLE_FILE_NAME } from '../../src/domain/exampleSchool';
import { exportClassIds } from '../../src/domain/exportDetails';
import { columnLetters } from '../../src/domain/text';
import { gridFixedHeight, workbookBytes } from '../../src/main/exportExcel';
import { createExporter } from '../../src/main/exportTimetable';

// IE-2: the sample school exported, read back with ExcelJS, and compared with the made-up
// expected workbook in fixtures/expectedWorkbook.ts, cell by cell (value, formula, cached
// result, style), with every merge, width, height, and the print setup.

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ttm-export-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function exported(classIds: string[]): Promise<ExcelJS.Workbook> {
  const path = join(folder, 'export.xlsx');
  await writeFile(path, await workbookBytes(exampleSchool, classIds, EXPORT_DETAILS));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

const allClassIds = () => exportClassIds(exampleSchool, 'all', null);

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (!found) throw new Error(`No sheet ${name}`);
  return found;
}

/** A cell as read back, with ExcelJS's empty border and "no fill" left out, and a merged
    cell's other cells holding no value of their own. */
function actualCell(ws: ExcelJS.Worksheet, row: number, column: number) {
  const cell = ws.getCell(row, column);
  const { border, fill, ...style } = cell.style;
  const read: unknown = cell.isMerged && cell.master !== cell ? null : (cell.value ?? null);
  // An empty cached result is in the file (`<v></v>` on a text formula), but ExcelJS reads
  // it back as none.
  const value =
    read !== null && typeof read === 'object' && 'formula' in read
      ? { formula: read.formula, result: (read as { result?: unknown }).result ?? '' }
      : read;
  return {
    value,
    style: {
      ...style,
      ...(border && Object.keys(border).length > 0 ? { border } : {}),
      ...(fill && !(fill.type === 'pattern' && fill.pattern === 'none') ? { fill } : {}),
    },
  };
}

function expectedCell(cell: ExpectedCell | null | undefined) {
  if (!cell) return { value: null, style: {} };
  return { value: cell[0], style: EXPECTED_STYLES[cell[1]] };
}

/** Every cell of the sheet against the expected grid, rows and columns past either's end
    included, so nothing extra is written either. */
function expectCells(ws: ExcelJS.Worksheet, expected: (ExpectedCell | null)[][]) {
  const rows = Math.max(ws.rowCount, expected.length);
  const columns = Math.max(ws.columnCount, ...expected.map((r) => r.length));
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      const where = `${ws.name}!${columnLetters(c)}${r}`;
      expect({ where, ...actualCell(ws, r, c) }).toEqual({
        where,
        ...expectedCell(expected[r - 1]?.[c - 1]),
      });
    }
  }
}

const formulaInto = (cell: string) => `'TKB tổng hợp'!${cell}&""`;
const lookup = (column: number, lastRow: number) =>
  `VLOOKUP(C6,'Data '!$H$6:$N$${lastRow},${column},0)&""`;

/** A class sheet as the fixture describes it: 6A1's frame, with the class's own header and
    formulas into its column of `TKB tổng hợp`. */
function expectedClassSheet(
  name: string,
  index: number,
  classCount: number,
): (ExpectedCell | null)[][] {
  const header = CLASS_HEADERS[name]!;
  const column = columnLetters(6 + index);
  const lastDataRow = 6 + classCount;
  return SHEET_6A1.map((row, r) =>
    row.map((cell, c): ExpectedCell | null => {
      if (!cell) return cell;
      const [value, style] = cell;
      if (r === 4 && c === 4)
        return [{ formula: lookup(2, lastDataRow), result: header.name }, style];
      if (r === 4 && c === 6)
        return [{ formula: lookup(4, lastDataRow), result: header.phone }, style];
      if (r === 5 && c === 2) return [name, style];
      if (r === 5 && c === 4)
        return [{ formula: lookup(6, lastDataRow), result: header.email }, style];
      if (style !== 'slot' || value === null || typeof value !== 'object') return cell;
      // A slot: the same row of the grid sheet, in this class's column.
      const gridRow = Number(/(\d+)&""$/.exec(value.formula)![1]);
      const dayIndex = c - 2;
      const offset = gridRow - 3 - dayIndex * GRID_DAY_ROWS.length;
      const period = GRID_DAY_ROWS[offset]![1]!;
      const subject = GRID_SLOTS[`${name} ${dayIndex} ${period}`]?.[0] ?? '';
      return [{ formula: formulaInto(`${column}${gridRow}`), result: subject }, style];
    }),
  );
}

/** `TKB tổng hợp` as the fixture describes it. */
function expectedGridSheet(classNames: readonly string[]): (ExpectedCell | null)[][] {
  const head = [...GRID_HEAD.slice(0, 5), ...classNames.map((n): ExpectedCell => [n, 'gridClass'])];
  const rows: (ExpectedCell | null)[][] = [
    head,
    head.map(([, style]): ExpectedCell => [null, style]),
  ];
  GRID_DAYS.forEach(([dayName, code, shortCode], day) => {
    GRID_DAY_ROWS.forEach((spec, i) => {
      const dayCells: ExpectedCell[] = [
        [i === 0 ? dayName : null, 'gridDay'],
        [code, 'gridDay'],
        [shortCode, 'gridShortDay'],
      ];
      if (spec[0] === 'fixed') {
        rows.push([
          ...dayCells,
          [null, 'gridFixedPeriod'],
          [spec[1], 'gridPeriod'],
          ...classNames.map((_, c): ExpectedCell => [c === 0 ? spec[2] : null, 'gridFixed']),
        ]);
        return;
      }
      const period = spec[0] === 'subject' ? spec[1] : GRID_DAY_ROWS[i - 1]![1]!;
      const part = spec[0] === 'subject' ? 0 : 1;
      rows.push([
        ...dayCells,
        [spec[0] === 'subject' ? spec[1] : null, 'gridPeriod'],
        [spec[0] === 'subject' ? spec[2] : null, 'gridPeriod'],
        ...classNames.map((name): ExpectedCell => [
          GRID_SLOTS[`${name} ${day} ${period}`]?.[part] || null,
          spec[0] === 'subject' ? 'gridSubject' : 'gridTeacher',
        ]),
      ]);
    });
  });
  return rows;
}

/** `Data ` as the fixture describes it, from H6. */
function expectedDataSheet(rows: readonly (readonly string[])[]): (ExpectedCell | null)[][] {
  const lead = Array<null>(DATA_COLUMNS.first - 1).fill(null);
  return [
    [],
    [],
    [],
    [],
    [],
    ...rows.map((row, r) => [
      ...lead,
      ...row.map((text): ExpectedCell => [text || null, r === 0 ? 'dataHead' : 'dataCell']),
    ]),
  ];
}

/** `Giáo viên` as the fixture describes it, from A1, for these teachers. */
function expectedTeacherSheet(shortNames: readonly string[]): (ExpectedCell | null)[][] {
  return [
    TEACHER_HEADER_ROW.map((text): ExpectedCell => [text, 'dataHead']),
    ...shortNames.map((name, index) => [
      [index + 1, 'teacherNumber'] as ExpectedCell,
      ...TEACHER_ROWS[name]!.map((text): ExpectedCell => [text || null, 'dataCell']),
    ]),
  ];
}

function expectClassSheetFrame(ws: ExcelJS.Worksheet) {
  expect(ws.columns.map((c) => c.width)).toEqual(CLASS_SHEET_COLUMNS);
  for (const [row, height] of Object.entries(CLASS_SHEET_HEIGHTS)) {
    expect({ row, height: ws.getRow(Number(row)).height }).toEqual({ row, height });
  }
  expect([...ws.model.merges].sort()).toEqual([...CLASS_SHEET_MERGES].sort());
  const { zoomScale, ...page } = CLASS_SHEET_PAGE;
  expect(ws.pageSetup).toMatchObject(page);
  expect(ws.views[0]).toMatchObject({ zoomScale });
}

describe('the Excel export of all classes (IE-2)', () => {
  it('writes the class sheets in class-bar order, then TKB tổng hợp, then Data ', async () => {
    const workbook = await exported(allClassIds());
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(EXPECTED_SHEET_NAMES);
  });

  it("writes 6A1's sheet as the expected one, cell by cell", async () => {
    const ws = sheet(await exported(allClassIds()), '6A1');
    expectCells(ws, SHEET_6A1);
    expectClassSheetFrame(ws);
  });

  it('writes every class sheet with its own header and its column of TKB tổng hợp', async () => {
    const workbook = await exported(allClassIds());
    // The fixture's description reads 6A1 back as its hand-written sheet.
    expect(expectedClassSheet('6A1', 0, SAMPLE_CLASSES.length)).toEqual(SHEET_6A1);
    SAMPLE_CLASSES.forEach((name, index) => {
      const ws = sheet(workbook, name);
      expectCells(ws, expectedClassSheet(name, index, SAMPLE_CLASSES.length));
      expectClassSheetFrame(ws);
    });
  });

  it('writes TKB tổng hợp laid out as the sample’s HK1', async () => {
    const ws = sheet(await exported(allClassIds()), 'TKB tổng hợp');
    expectCells(ws, expectedGridSheet(SAMPLE_CLASSES));

    expect(ws.columns.map((c) => c.width)).toEqual([
      ...GRID_COLUMNS.slice(0, 5),
      ...SAMPLE_CLASSES.map(() => GRID_COLUMNS[5]),
    ]);
    expect(ws.getRow(1).height).toBe(GRID_HEIGHTS.head[0]);
    expect(ws.getRow(2).height).toBe(GRID_HEIGHTS.head[1]);
    GRID_DAY_ROWS.forEach(([kind], i) => {
      for (const day of [0, 4]) {
        const row = 3 + day * GRID_DAY_ROWS.length + i;
        expect({ row, height: ws.getRow(row).height }).toEqual({ row, height: GRID_HEIGHTS[kind] });
      }
    });
    const headMerges = GRID_HEAD.slice(0, 5)
      .map((_, i) => i)
      .concat(SAMPLE_CLASSES.map((_, i) => 5 + i))
      .map((i) => `${columnLetters(i + 1)}1:${columnLetters(i + 1)}2`);
    const dayMerges = GRID_DAYS.map((_, day) => {
      const first = 3 + day * GRID_DAY_ROWS.length;
      return `A${first}:A${first + GRID_DAY_ROWS.length - 1}`;
    });
    // Each fixed row's text runs across the class columns (R4-8 review).
    const lastClass = columnLetters(5 + SAMPLE_CLASSES.length);
    const fixedMerges = GRID_DAYS.flatMap((_, day) =>
      GRID_DAY_ROWS.flatMap(([kind], i) => {
        const row = 3 + day * GRID_DAY_ROWS.length + i;
        return kind === 'fixed' ? [`F${row}:${lastClass}${row}`] : [];
      }),
    );
    expect([...ws.model.merges].sort()).toEqual(
      [...headMerges, ...dayMerges, ...fixedMerges].sort(),
    );
    expect(ws.views[0]).toMatchObject(GRID_VIEW);
    expect(ws.pageSetup).toMatchObject(GRID_PAGE);
  });

  it('writes Data  with each class’s homeroom teacher and assistant from H6', async () => {
    const ws = sheet(await exported(allClassIds()), 'Data ');
    expectCells(ws, expectedDataSheet(DATA_ROWS));
    DATA_COLUMNS.widths.forEach((width, i) => {
      expect(ws.getColumn(DATA_COLUMNS.first + i).width).toBe(width);
    });
  });

  it('writes Giáo viên with every teacher used, numbered, from A1 (R5-3)', async () => {
    const ws = sheet(await exported(allClassIds()), 'Giáo viên');
    expectCells(ws, expectedTeacherSheet(Object.keys(TEACHER_ROWS)));
    expect(ws.columns.map((c) => c.width)).toEqual(TEACHER_COLUMN_WIDTHS);
    expect(ws.getRow(1).height).toBe(TEACHER_HEAD_HEIGHT);
  });
});

describe('the Excel export of this class (IE-2)', () => {
  it('writes one class sheet, its column of TKB tổng hợp, and its row of Data ', async () => {
    const workbook = await exported(['c-8ce1']);
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      '8CE1',
      'TKB tổng hợp',
      'Data ',
      'Giáo viên',
    ]);
    expectCells(sheet(workbook, '8CE1'), expectedClassSheet('8CE1', 0, 1));
    expectCells(sheet(workbook, 'TKB tổng hợp'), expectedGridSheet(['8CE1']));
    expectCells(sheet(workbook, 'Data '), expectedDataSheet([DATA_ROWS[0]!, DATA_ROWS[4]!]));
    // Its assistant and its teacher, who's also its homeroom teacher, in teacher-list order.
    expectCells(sheet(workbook, 'Giáo viên'), expectedTeacherSheet(['Cô Vy', 'Cô Trâm']));
  });

  it('makes the lunch row tall enough for its three lines in the one class column', async () => {
    const ws = sheet(await exported(['c-8ce1']), 'TKB tổng hợp');
    GRID_DAY_ROWS.forEach((spec, i) => {
      if (spec[0] !== 'fixed') return;
      const row = 3 + i;
      const height = spec[2].startsWith('Ăn trưa') ? 69 : GRID_HEIGHTS.fixed;
      expect({ row, height: ws.getRow(row).height }).toEqual({ row, height });
    });
  });
});

describe('a fixed row of TKB tổng hợp (R4-8 review)', () => {
  const lunch = 'Ăn trưa & Nghỉ trưa/ Lunch time & Nap time';

  it("keeps the sample's height for text that fits two lines", () => {
    expect(gridFixedHeight('Ăn sáng/ Breakfast', 1)).toBe(42);
    expect(gridFixedHeight(lunch, 2)).toBe(42);
  });

  it('grows a line at a time for longer text', () => {
    expect(gridFixedHeight(lunch, 1)).toBe(69);
    expect(gridFixedHeight(`${lunch} ${lunch}`, 1)).toBe(138);
  });
});

describe('column letters', () => {
  it('names columns past Z as Excel does', () => {
    expect([1, 6, 26, 27, 52, 53, 702, 703].map(columnLetters)).toEqual([
      'A',
      'F',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});

/** LibreOffice 7.2 or later, where it's installed, to check the file opens as it is. Older
    versions can't write every sheet to its own CSV, which the check reads. */
function libreOffice(): string | null {
  for (const name of ['soffice', 'libreoffice']) {
    try {
      const version = execFileSync(name, ['--version'], { encoding: 'utf8', timeout: 30_000 });
      const [major = 0, minor = 0] = (/LibreOffice (\d+)\.(\d+)/.exec(version) ?? [])
        .slice(1)
        .map(Number);
      return major > 7 || (major === 7 && minor >= 2) ? name : null;
    } catch {
      // Not on the path.
    }
  }
  return null;
}

const office = libreOffice();

/** Every sheet of each workbook in `paths` as CSV, by sheet name, read by LibreOffice in one
    run. With `recalculate`, LibreOffice works every formula out again on loading, as Excel
    does after a cell changes; without it, it shows the cached results. Each way has a
    LibreOffice profile of its own, so a running copy of LibreOffice isn't disturbed. */
async function sheetsAsCsv(
  paths: readonly string[],
  names: readonly string[],
  recalculate: boolean,
): Promise<Record<string, string>[]> {
  const profile = join(folder, recalculate ? 'lo-recalculate' : 'lo-cached');
  // OOXMLRecalcMode 0 is "Always recalculate" for Excel files (1, the default, is "Never").
  // Written for a new profile only: once LibreOffice has run, the file is its own, with the
  // setting kept.
  await mkdir(join(profile, 'user'), { recursive: true });
  await writeFile(
    join(profile, 'user', 'registrymodifications.xcu'),
    `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>${recalculate ? 0 : 1}</value></prop></item>
</oor:items>
`,
    { flag: 'wx' },
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const outDir = join(profile, 'csv');
  execFileSync(
    office!,
    [
      `-env:UserInstallation=file://${profile}`,
      '--headless',
      '--convert-to',
      'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1',
      '--outdir',
      outDir,
      ...paths,
    ],
    { stdio: 'ignore', timeout: LIBRE_OFFICE_RUN },
  );
  return Promise.all(
    paths.map(async (path) => {
      const sheets: Record<string, string> = {};
      for (const name of names) {
        sheets[name] = await readFile(
          join(outDir, `${basename(path, '.xlsx')}-${name}.csv`),
          'utf8',
        );
      }
      return sheets;
    }),
  );
}

/** How long one LibreOffice run may take, its first start in a new profile included. */
const LIBRE_OFFICE_RUN = 110_000;

describe.skipIf(office === null)('the exported file in LibreOffice', () => {
  it(
    'opens without repair and shows every value',
    { timeout: LIBRE_OFFICE_RUN + 10_000 },
    async () => {
      const path = join(folder, 'export.xlsx');
      await writeFile(path, await workbookBytes(exampleSchool, allClassIds(), EXPORT_DETAILS));
      const [csv] = await sheetsAsCsv([path], EXPECTED_SHEET_NAMES, false);
      const sheet6A1 = csv!['6A1']!;
      expect(sheet6A1).toContain('GVCN/Form Teacher:,Lương Thị Ngân,SĐT,0912 345 678');
      expect(sheet6A1).toContain('1-2,8:00 - 9:10,Toán,Tiếng Anh,Tin học (first half),Ngữ văn,');
      expect(sheet6A1).toContain('9-10,14:50 - 16:00,,,,,SH lớp + GDPC');
      // Empty slots stay empty rather than showing 0.
      expect(sheet6A1).not.toMatch(/,0(,|$)/m);
      expect(csv!['TKB tổng hợp']).toContain('Th2,T2,THCS12,8:00 - 9:10,Toán,,Toán,,,');
      expect(csv!['Data ']).toContain('8CE1,Ứng Ngọc Trâm,Lạc Thảo Vy,024 3826 1234');
      expect(csv!['Giáo viên']).toContain('1,Lương Thị Ngân,Cô Ngân,0912 345 678,');
    },
  );

  it(
    'opens the example workbook and shows the sample school (R5-3)',
    { timeout: LIBRE_OFFICE_RUN + 10_000 },
    async () => {
      const path = join(folder, EXAMPLE_FILE_NAME);
      const exporter = createExporter({
        askWhere: async () => path,
        documentsFolder: () => folder,
        saveDetails: async () => undefined,
      });
      expect(await exporter.saveExample(false)).toMatchObject({ status: 'saved', path });

      const [csv] = await sheetsAsCsv([path], EXPECTED_SHEET_NAMES, false);
      expect(csv!['6A1']).toContain('1-2,8:00 - 9:10,Toán,Tiếng Anh,Tin học (first half),Ngữ văn,');
      expect(csv!['TKB tổng hợp']).toContain('Th2,T2,THCS12,8:00 - 9:10,Toán,,Toán,,,');
      expect(csv!['Giáo viên']).toContain('2,Tạ Văn Phúc,Thầy Phúc,,phuc.tv@example.com,THCS,THPT');
    },
  );

  it(
    'reads the class sheets from TKB tổng hợp and Data , so a change there shows (R4-7)',
    // Two LibreOffice runs, each in a new profile.
    { timeout: 2 * LIBRE_OFFICE_RUN + 10_000 },
    async () => {
      const path = join(folder, 'export.xlsx');
      await writeFile(path, await workbookBytes(exampleSchool, allClassIds(), EXPORT_DETAILS));

      // 6A1's Monday 1–2 becomes Ngữ văn in TKB tổng hợp, and Cô Ngân's phone changes in
      // Data , as someone editing the file in Excel would do.
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(path);
      sheet(workbook, 'TKB tổng hợp').getCell('F5').value = 'Ngữ văn';
      sheet(workbook, 'Data ').getCell('K7').value = '0900 000 000';
      const edited = join(folder, 'edited.xlsx');
      await workbook.xlsx.writeFile(edited);

      const [cached] = await sheetsAsCsv([path], EXPECTED_SHEET_NAMES, false);
      const [recalculated, after] = await sheetsAsCsv([path, edited], EXPECTED_SHEET_NAMES, true);
      // Worked out again, every formula gives the result cached with it.
      expect(recalculated).toEqual(cached);

      expect(after!['6A1']).toContain('GVCN/Form Teacher:,Lương Thị Ngân,SĐT,0900 000 000');
      expect(after!['6A1']).toContain(
        '1-2,8:00 - 9:10,Ngữ văn,Tiếng Anh,Tin học (first half),Ngữ văn,',
      );
      // Another class's sheet reads its own column and row.
      expect(after!['6A2']).toBe(recalculated!['6A2']);
    },
  );
});
