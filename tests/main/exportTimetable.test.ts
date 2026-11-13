import ExcelJS from 'exceljs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPECTED_SHEET_NAMES, EXPORT_DETAILS } from '../../fixtures/expectedWorkbook';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { defaultExportDetails } from '../../src/domain/exportDetails';
import type { ExportFormat } from '../../src/domain/exportSheets';
import { createExporter, exportFailureReason } from '../../src/main/exportTimetable';
import type { ExportRequest } from '../../src/shared/ipc';

// The export flow (IE-2, SYSTEM_DESIGN §11.4): the save dialog, the file, Try again, and
// the details remembered for the profile.

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ttm-exporter-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const request = (extra: Partial<ExportRequest> = {}): ExportRequest => ({
  file: exampleSchool,
  classIds: ['c-6a1'],
  scope: 'class',
  format: 'xlsx',
  details: EXPORT_DETAILS,
  ...extra,
});

function setUp(answers: (string | null)[]) {
  const askWhere = vi.fn<(path: string, format: ExportFormat) => Promise<string | null>>(
    async () => answers.shift() ?? null,
  );
  const saveDetails = vi.fn(async () => undefined);
  const write = vi.fn<(path: string, bytes: Buffer) => Promise<void>>();
  return { askWhere, saveDetails, write };
}

describe('exporting', () => {
  it('asks where with the suggested name in Documents, writes there, and keeps the details', async () => {
    const path = join(folder, 'TKB 6A1.xlsx');
    const deps = setUp([path]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder, write: undefined });

    const result = await exporter.run(request());

    expect(deps.askWhere).toHaveBeenCalledWith(join(folder, 'TKB 6A1.xlsx'), 'xlsx');
    expect(result).toEqual({ status: 'saved', path, fileName: 'TKB 6A1.xlsx', folder });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      '6A1',
      'TKB tổng hợp',
      'Data ',
      'Giáo viên',
    ]);
    expect(deps.saveDetails).toHaveBeenCalledWith(EXPORT_DETAILS);
    expect(exporter.exported(path)).toBe(true);
    expect(exporter.exported(join(folder, 'other.xlsx'))).toBe(false);
  });

  it('suggests the folder used last and the name for all classes next time', async () => {
    const deps = setUp(['/school/out/TKB 6A1.xlsx', null]);
    const exporter = createExporter({ ...deps, documentsFolder: () => '/home/me/Documents' });
    await exporter.run(request());
    await exporter.run(request({ scope: 'all', classIds: ['c-6a1', 'c-6a2'] }));
    expect(deps.askWhere).toHaveBeenLastCalledWith('/school/out/TKB all classes.xlsx', 'xlsx');
  });

  it('writes nothing when the save dialog is cancelled', async () => {
    const deps = setUp([null]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });
    expect(await exporter.run(request())).toEqual({ status: 'cancelled' });
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.saveDetails).not.toHaveBeenCalled();
  });

  it('adds the extension to a name typed without it', async () => {
    const deps = setUp([join(folder, 'Timetable')]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });
    const result = await exporter.run(request());
    expect(result).toMatchObject({ status: 'saved', fileName: 'Timetable.xlsx' });
    expect(deps.write).toHaveBeenCalledWith(join(folder, 'Timetable.xlsx'), expect.any(Buffer));
  });

  it('says why a file was not written, and Try again writes to the same place', async () => {
    const path = join(folder, 'TKB 6A1.xlsx');
    const deps = setUp([path]);
    deps.write.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });

    expect(await exporter.run(request())).toEqual({
      status: 'failed',
      fileName: 'TKB 6A1.xlsx',
      reason: 'TKB 6A1.xlsx is open in another program. Close it and try again.',
    });
    expect(deps.saveDetails).not.toHaveBeenCalled();

    expect(await exporter.run(request({ retry: true }))).toMatchObject({ status: 'saved', path });
    expect(deps.askWhere).toHaveBeenCalledTimes(1);
    expect(deps.write).toHaveBeenLastCalledWith(path, expect.any(Buffer));
  });

  it('refuses a request that is not a timetable, an unknown class, or bad details', async () => {
    const deps = setUp([join(folder, 'x.xlsx')]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });
    await expect(exporter.run({ file: {} })).rejects.toThrow("The export request isn't valid.");
    await expect(exporter.run(request({ file: { schemaVersion: 1 } as never }))).rejects.toThrow(
      "doesn't match the file format",
    );
    await expect(exporter.run(request({ classIds: ['c-nope'] }))).rejects.toThrow(
      'A class to export is missing.',
    );
    await expect(
      exporter.run(request({ details: { ...EXPORT_DETAILS, schoolYear: '2026' } })),
    ).rejects.toThrow('Enter the school year, as in 2026 - 2027.');
    expect(deps.askWhere).not.toHaveBeenCalled();
  });

  it('replaces an earlier export, and a write that fails leaves it as it was', async () => {
    const path = join(folder, 'TKB 6A1.xlsx');
    await writeFile(path, 'last week');
    const deps = setUp([path, join(folder, 'held')]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder, write: undefined });
    expect(await exporter.run(request())).toMatchObject({ status: 'saved', path });
    expect((await readFile(path)).subarray(0, 2).toString()).toBe('PK');

    // A folder where the file would go: the new file can't be renamed over it.
    await mkdir(join(folder, 'held.xlsx'));
    await writeFile(join(folder, 'held.xlsx', 'inside'), 'kept');
    expect(await exporter.run(request())).toMatchObject({ status: 'failed' });
    expect(await readFile(join(folder, 'held.xlsx', 'inside'), 'utf8')).toBe('kept');
    expect((await readdir(folder)).sort()).toEqual(['TKB 6A1.xlsx', 'held.xlsx']);
  });

  it('keeps the details cleaned', async () => {
    const deps = setUp([join(folder, 'TKB 6A1.xlsx')]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });
    await exporter.run(request({ details: { ...EXPORT_DETAILS, schoolYear: '2026-2027' } }));
    expect(deps.saveDetails).toHaveBeenCalledWith(EXPORT_DETAILS);
  });
});

describe('why an export failed', () => {
  const reason = (code: string) =>
    exportFailureReason(Object.assign(new Error('x'), { code }), 'TKB 6A1.xlsx', 'D:\\TKB');

  it('says what to do', () => {
    expect(reason('EPERM')).toBe(
      "TKB 6A1.xlsx couldn't be written in D:\\TKB. It may be open in another program, such " +
        'as Excel, or the folder may be read-only. Close it and try again, or choose another ' +
        'folder.',
    );
    expect(reason('ENOSPC')).toBe(
      "The disk is full, so TKB 6A1.xlsx couldn't be written. Free some space.",
    );
    expect(reason('EROFS')).toBe(
      "TKB 6A1.xlsx is on a drive that can't be written to. Choose another folder.",
    );
    expect(reason('ENOENT')).toBe(
      'The folder D:\\TKB is missing. It may have been moved or deleted.',
    );
    expect(exportFailureReason(new Error('Odd.'), 'TKB 6A1.xlsx', 'D:\\TKB')).toBe(
      "TKB 6A1.xlsx couldn't be written: Odd.",
    );
  });
});

describe('saving the example workbook (IE-1)', () => {
  const details = defaultExportDetails(new Date());

  it('suggests its name, writes the sample school as All classes, and keeps no details', async () => {
    const path = join(folder, 'TKB example.xlsx');
    const deps = setUp([path]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder, write: undefined });

    const result = await exporter.saveExample(undefined);

    expect(deps.askWhere).toHaveBeenCalledWith(path, 'xlsx');
    expect(result).toEqual({ status: 'saved', path, fileName: 'TKB example.xlsx', folder });
    expect(exporter.exported(path)).toBe(true);
    expect(deps.saveDetails).not.toHaveBeenCalled();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(EXPECTED_SHEET_NAMES);
    expect(workbook.getWorksheet('6A1')?.getCell('A1').value).toBe(
      `THỜI KHÓA BIỂU NĂM HỌC ${details.schoolYear}`,
    );
    expect(workbook.getWorksheet('6A1')?.getCell('A5').value).toBe(
      'Trường/School: Trung học/Secondary School',
    );
  });

  it('writes nothing when the save dialog is cancelled', async () => {
    const deps = setUp([null]);
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });
    expect(await exporter.saveExample(false)).toEqual({ status: 'cancelled' });
    expect(deps.write).not.toHaveBeenCalled();
  });

  it('says why a save failed, and Try again writes to the same place without asking', async () => {
    const path = join(folder, 'TKB example.xlsx');
    const deps = setUp([path]);
    deps.write.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    const exporter = createExporter({ ...deps, documentsFolder: () => folder });

    expect(await exporter.saveExample(false)).toMatchObject({
      status: 'failed',
      fileName: 'TKB example.xlsx',
    });
    expect(await exporter.saveExample(true)).toMatchObject({ status: 'saved', path });
    expect(deps.askWhere).toHaveBeenCalledTimes(1);
    expect(deps.write).toHaveBeenCalledTimes(2);
  });

  it('starts in the folder an export used last', async () => {
    const deps = setUp(['/school/out/TKB 6A1.xlsx', null]);
    const exporter = createExporter({ ...deps, documentsFolder: () => '/home/me/Documents' });
    await exporter.run(request());
    await exporter.saveExample(false);
    expect(deps.askWhere).toHaveBeenLastCalledWith('/school/out/TKB example.xlsx', 'xlsx');
  });
});
