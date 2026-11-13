import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { EXPORT_DETAILS } from '../../fixtures/expectedWorkbook';
import { referenceWorkbook, referenceWorkbookData } from '../../fixtures/referenceWorkbook';
import { SAMPLE_CLASSES } from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { exportClassIds } from '../../src/domain/exportDetails';
import { readTimetableLayout, suggestImport } from '../../src/domain/importWorkbook';
import { workbookBytes } from '../../src/main/exportExcel';
import { cellText, createImportReader, readWorkbook } from '../../src/main/importExcel';

// IE-1, reading the chosen workbook (SYSTEM_DESIGN §12.1): each cell as its text as Excel
// shows it, merged cells filled, hidden sheets marked, and a file that can't be read refused
// with a reason. Then the app's own export, read back, gets the right suggestions.

async function bytesOf(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A workbook with every kind of cell the school's file has. */
async function cellsWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('HK1');
  ws.getCell('A1').value = 'Thứ Hai / Monday';
  ws.mergeCells('A1:A3');
  ws.getCell('B1').value = { formula: 'HLOOKUP(F1,X!A1:B2,2,0)', result: 'Cô Lan' };
  ws.getCell('B2').value = { formula: 'C1+1', result: 912345678 };
  ws.getCell('B3').value = { formula: 'X!A1', result: { error: '#REF!' } };
  ws.getCell('C1').value = 912345678;
  ws.getCell('C2').value = 0.5;
  ws.getCell('C3').value = new Date(Date.UTC(2026, 8, 3));
  ws.getCell('D1').value = new Date(Date.UTC(1899, 11, 30, 16, 0));
  ws.getCell('D2').value = {
    richText: [{ text: 'Toán ' }, { text: 'Bộ giáo dục', font: { bold: true } }],
  };
  ws.getCell('D3').value = { text: 'lan@school.example', hyperlink: 'mailto:lan@school.example' };
  ws.getCell('E1').value = '\u00a0 Ngữ văn\u00a0';
  ws.getCell('E2').value = true;
  ws.getCell('G5').value = '';
  const hidden = workbook.addWorksheet('TKB 1S', { state: 'hidden' });
  hidden.getCell('A1').value = 'Th2';
  workbook.addWorksheet('Empty');
  return bytesOf(workbook);
}

describe('readWorkbook', () => {
  it('reads the reference workbook, formulas and numbers included, as its plain form', async () => {
    const data = await readWorkbook(await bytesOf(referenceWorkbook()), 'TKB reference.xlsx');
    expect(data).toEqual(referenceWorkbookData());
  });

  it('reads each cell as Excel shows it', async () => {
    const data = await readWorkbook(await cellsWorkbook(), 'TKB.xlsx');
    expect(data.fileName).toBe('TKB.xlsx');
    expect(data.sheets[0]).toEqual({
      name: 'HK1',
      hidden: false,
      rows: [
        ['Thứ Hai / Monday', 'Cô Lan', '912345678', '16:00', 'Ngữ văn'],
        ['Thứ Hai / Monday', '912345678', '0.5', 'Toán Bộ giáo dục', 'TRUE'],
        ['Thứ Hai / Monday', '', '03/09/2026', 'lan@school.example'],
      ],
    });
  });

  it('marks hidden sheets and keeps empty ones, in workbook order', async () => {
    const data = await readWorkbook(await cellsWorkbook(), 'TKB.xlsx');
    expect(data.sheets.map(({ name, hidden, rows }) => ({ name, hidden, rows }))).toEqual([
      expect.objectContaining({ name: 'HK1' }),
      { name: 'TKB 1S', hidden: true, rows: [['Th2']] },
      { name: 'Empty', hidden: false, rows: [] },
    ]);
  });

  it('skips rows and cells that only have formatting, keeping where the values are', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Data ');
    ws.getCell('H6').value = 'Lớp';
    ws.getCell('B9').value = '6A1';
    // Formatting far past the data, as a sheet styled down to the bottom has.
    ws.getRow(60000).height = 30;
    ws.getCell('Z5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBD4B4' } };
    ws.getCell('C7').value = '';
    const data = await readWorkbook(await bytesOf(workbook), 'TKB.xlsx');
    expect(data.sheets[0]?.rows).toEqual([
      [],
      [],
      [],
      [],
      [],
      ['', '', '', '', '', '', '', 'Lớp'],
      [],
      [],
      ['', '6A1'],
    ]);
  });

  it('fills a range merged across columns, as a fixed row in TKB tổng hợp is', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('TKB tổng hợp');
    ws.getCell('F3').value = 'Ăn sáng/ Breakfast';
    ws.mergeCells('F3:H3');
    const data = await readWorkbook(await bytesOf(workbook), 'TKB.xlsx');
    expect(data.sheets[0]?.rows[2]).toEqual([
      '',
      '',
      '',
      '',
      '',
      'Ăn sáng/ Breakfast',
      'Ăn sáng/ Breakfast',
      'Ăn sáng/ Breakfast',
    ]);
  });

  it('turns cell values into text one by one', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(12)).toBe('12');
    expect(cellText(1 / 3)).toBe('0.3333333333');
    expect(cellText({ sharedFormula: 'B1', result: 'Toán' } as ExcelJS.CellValue)).toBe('Toán');
    expect(cellText({ formula: 'A1', result: undefined } as unknown as ExcelJS.CellValue)).toBe('');
    expect(cellText({ error: '#N/A' } as ExcelJS.CellValue)).toBe('');
  });
});

describe('createImportReader', () => {
  const reader = (path: string | null, read?: (path: string) => Promise<Buffer>) =>
    createImportReader({ askWhich: () => Promise.resolve(path), read });

  it('reads the chosen workbook', async () => {
    const bytes = await cellsWorkbook();
    const result = await reader('/school/TKB.xlsx', () => Promise.resolve(bytes))();
    expect(result.status).toBe('read');
    if (result.status === 'read') expect(result.workbook.fileName).toBe('TKB.xlsx');
  });

  it('does nothing when the dialog is cancelled', async () => {
    const read = () => Promise.reject(new Error('not read'));
    expect(await reader(null, read)()).toEqual({ status: 'cancelled' });
  });

  it('refuses an .xls, or any other file, without reading it', async () => {
    const read = () => Promise.reject(new Error('not read'));
    expect(await reader('/school/TKB.xls', read)()).toEqual({
      status: 'failed',
      fileName: 'TKB.xls',
      reason: "TKB.xls isn't an .xlsx workbook. Save it as .xlsx in Excel and choose it again.",
    });
  });

  it("says why a file can't be opened", async () => {
    const failing = (code: string) => () =>
      Promise.reject(Object.assign(new Error(code), { code }));
    expect(await reader('/s/TKB.xlsx', failing('EBUSY'))()).toMatchObject({
      reason: 'TKB.xlsx is open in another program. Close it and try again.',
    });
    expect(await reader('/s/TKB.xlsx', failing('EACCES'))()).toMatchObject({
      reason: "TKB.xlsx couldn't be opened. You may not have permission to read it.",
    });
    expect(await reader('/s/TKB.xlsx', failing('ENOENT'))()).toMatchObject({
      reason: 'TKB.xlsx is missing. It may have been moved or deleted.',
    });
  });

  it('says a damaged file may not be a workbook', async () => {
    const result = await reader('/s/TKB.xlsx', () => Promise.resolve(Buffer.from('not a zip')))();
    expect(result).toEqual({
      status: 'failed',
      fileName: 'TKB.xlsx',
      reason: "TKB.xlsx couldn't be read. It may be damaged, or not an Excel workbook.",
    });
  });
});

describe("the app's own export, read back", () => {
  it('has its grid and Data found, with every class and block', async () => {
    const classIds = exportClassIds(exampleSchool, 'all', null);
    const bytes = await workbookBytes(exampleSchool, classIds, EXPORT_DETAILS);
    const data = await readWorkbook(bytes, 'TKB all classes.xlsx');

    const choices = suggestImport(data);
    expect(choices.timetable.sheet).toBe('TKB tổng hợp');
    expect(choices.classes).toEqual({
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
    });
    expect(choices.teachers).toEqual({
      sheet: 'Giáo viên',
      headerRow: 0,
      columns: { shortName: 2, fullName: 1, email: 4, phone: 3, school: 5, alsoAt: 6 },
    });

    const grid = data.sheets.find((s) => s.name === 'TKB tổng hợp');
    const layout = grid ? readTimetableLayout(grid) : null;
    expect(layout?.classes.map((c) => c.name)).toEqual([...SAMPLE_CLASSES]);
    // The merged day names and codes read on every row, so all 25 blocks have their day.
    expect(layout?.dayless).toEqual([]);
    expect(layout?.blocks.map((b) => `${b.day}${b.block}`)).toEqual(
      [0, 1, 2, 3, 4].flatMap((day) => [0, 1, 2, 3, 4].map((block) => `${day}${block}`)),
    );
    // Each block's subject row is the export's: Monday's first block is row 5.
    expect(layout?.blocks[0]?.row).toBe(4);
  });
});
