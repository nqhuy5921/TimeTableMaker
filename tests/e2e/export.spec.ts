import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import ExcelJS from 'exceljs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { schoolYearOf } from '../../src/domain/exportDetails';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { savedPath } from './dataFolder';

// Exporting to Excel (IE-2, TC-4; SYSTEM_DESIGN §11.4): the Export menu, the dialog with its
// details and issues line, the system save dialog (stood in for in the main process), the
// file, and the notice. Each test starts the app on its own data folder with TTM_USER_DATA.

let userData: string;
let out: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  out = mkdtempSync(join(tmpdir(), 'ttm-e2e-out-'));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

function seed(file: TimetableFile, selectedClassId: string | null) {
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ selectedClassId }));
}

/** The save dialog's answers in turn (a path, or null for Cancel), and what it was asked;
    Show in folder only records the path. */
async function standInForDialogs(app: ElectronApplication, answers: (string | null)[]) {
  await app.evaluate(({ dialog, shell }, given) => {
    const g = globalThis as unknown as { asked: string[]; shown: string[] };
    g.asked = [];
    g.shown = [];
    const fake = async (...args: unknown[]) => {
      const options = args.at(-1) as { defaultPath: string };
      g.asked.push(options.defaultPath);
      const path = given.shift() ?? null;
      return { canceled: path === null, filePath: path ?? '' };
    };
    Object.assign(dialog, { showSaveDialog: fake });
    Object.assign(shell, { showItemInFolder: (path: string) => g.shown.push(path) });
  }, answers);
}

const asked = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { asked: string[] }).asked);
const shown = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { shown: string[] }).shown);

async function withApp(run: (page: Page, app: ElectronApplication) => Promise<void>) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    await run(await app.firstWindow(), app);
  } finally {
    await app.close();
  }
}

async function openExport(page: Page, item: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function readWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

const notice = (page: Page) => page.locator('.save-notice');

test('This class as Excel asks before exporting with errors, then saves the workbook', async () => {
  seed(exampleSchool, 'c-6a1');
  const path = join(out, 'TKB 6A1.xlsx');
  await withApp(async (page, app) => {
    await standInForDialogs(app, [path]);
    await openExport(page, 'This class as Excel');

    const dialog = page.getByRole('dialog', { name: 'Export 6A1 as Excel' });
    await expect(dialog.getByLabel('School', { exact: true })).toHaveValue(
      'Trung học/Secondary School',
    );
    await expect(dialog.getByLabel('School year')).toHaveValue(schoolYearOf(new Date()));
    // TC-4: 6A1's issues, and the button says it.
    await expect(dialog.getByTestId('export-issues')).toHaveText(
      '6A1 has 5 errors. You can still export it.',
    );
    await expect(dialog.getByTestId('export-issues')).toHaveClass(/tone-error/);

    // The details are checked before the save dialog opens.
    await dialog.getByLabel('School year').fill('2026');
    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter the school year, as in 2026 - 2027.');
    expect(await asked(app)).toEqual([]);

    await dialog.getByLabel('School year').fill('2026 - 2027');
    await dialog.getByLabel('Applies from').fill('2026-09-03');
    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(notice(page)).toContainText(`Saved TKB 6A1.xlsx${out}`);
    expect((await asked(app))[0]).toMatch(/TKB 6A1\.xlsx$/);
    await notice(page).getByRole('button', { name: 'Show in folder' }).click();
    await expect.poll(() => shown(app)).toEqual([path]);
    await notice(page).getByRole('button', { name: 'Hide' }).click();
    await expect(notice(page)).toHaveCount(0);
  });

  const workbook = await readWorkbook(path);
  expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
    '6A1',
    'TKB tổng hợp',
    'Data ',
    'Giáo viên',
  ]);
  const sheet = workbook.getWorksheet('6A1')!;
  expect(sheet.getCell('A1').value).toBe('THỜI KHÓA BIỂU NĂM HỌC 2026 - 2027');
  expect(sheet.getCell('A3').value).toBe('(Áp dụng từ ngày 03/09/2026)');
  expect(sheet.getCell('C11').value).toEqual({ formula: `'TKB tổng hợp'!F5&""`, result: 'Toán' });
  // The homeroom teacher's full name, phone, and email head the sheet (DM-1's phone).
  expect(['E5', 'G5', 'E6'].map((cell) => sheet.getCell(cell).result)).toEqual([
    'Lương Thị Ngân',
    '0912 345 678',
    'ngan.lt@example.com',
  ]);
  // Exporting changes nothing in the timetable.
  expect(JSON.parse(readFileSync(savedPath(userData), 'utf8'))).toEqual(exampleSchool);
  // The details are kept in the profile's settings for next time.
  expect(JSON.parse(readFileSync(savedPath(userData, 'settings.json'), 'utf8'))).toEqual({
    selectedClassId: 'c-6a1',
    exportDetails: {
      schoolName: 'Trung học/Secondary School',
      schoolYear: '2026 - 2027',
      appliesFrom: '2026-09-03',
    },
  });
});

test('All classes as Excel counts the whole timetable, and a cancelled save keeps the dialog', async () => {
  seed(exampleSchool, 'c-9b1');
  const path = join(out, 'TKB all classes.xlsx');
  await withApp(async (page, app) => {
    await standInForDialogs(app, [null, path]);
    await openExport(page, 'All classes as Excel');
    const dialog = page.getByRole('dialog', { name: 'Export all 6 classes as Excel' });
    await expect(dialog.getByTestId('export-issues')).toHaveText(
      'The timetable has 10 errors and 1 warning. You can still export it.',
    );

    // Cancel in the save dialog comes back to the Export dialog, with nothing written.
    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    await expect.poll(async () => (await asked(app)).length).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Export anyway' })).toBeEnabled();
    expect(existsSync(path)).toBe(false);

    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(notice(page)).toContainText('Saved TKB all classes.xlsx');
    expect((await asked(app))[1]).toMatch(/TKB all classes\.xlsx$/);

    // 9B1 has no issues, so its export just says Export.
    await openExport(page, 'This class as Excel');
    const clean = page.getByRole('dialog', { name: 'Export 9B1 as Excel' });
    await expect(clean.getByTestId('export-issues')).toHaveCount(0);
    await expect(clean.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await clean.getByRole('button', { name: 'Cancel' }).click();
    await expect(clean).toHaveCount(0);
  });

  const workbook = await readWorkbook(path);
  expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
    '6A1',
    '6A2',
    '7AA1',
    '8CE1',
    '9B1',
    '9BA1',
    'TKB tổng hợp',
    'Data ',
    'Giáo viên',
  ]);
});

test('a failed export says why, and Try again writes the timetable as it is now to the same place', async () => {
  seed(exampleSchool, 'c-6a1');
  const folder = join(out, 'not yet');
  const path = join(folder, 'TKB all classes.xlsx');
  await withApp(async (page, app) => {
    await standInForDialogs(app, [path]);
    await openExport(page, 'All classes as Excel');
    let dialog = page.getByRole('dialog', { name: 'Export all 6 classes as Excel' });
    await dialog.getByLabel('School', { exact: true }).fill('Trường Thử Nghiệm');
    await dialog.getByRole('button', { name: 'Export anyway' }).click();

    const failed = page.getByRole('alert').filter({ hasText: "TKB all classes.xlsx wasn't saved" });
    await expect(failed).toContainText(
      `The folder ${folder} is missing. It may have been moved or deleted.`,
    );

    // The details typed aren't lost with the failure.
    await openExport(page, 'All classes as Excel');
    dialog = page.getByRole('dialog', { name: 'Export all 6 classes as Excel' });
    await expect(dialog.getByLabel('School', { exact: true })).toHaveValue('Trường Thử Nghiệm');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // A class added after the failure is in the file Try again writes, and the notice
    // stays up on another screen.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Classes' })
      .click();
    await page.getByRole('button', { name: 'Add class' }).click();
    const form = page.getByRole('dialog', { name: 'Add class' });
    await form.getByLabel('Name').fill('6A3');
    await form.getByLabel('Homeroom teacher', { exact: true }).selectOption('Thầy Phúc');
    await form.getByRole('button', { name: 'Add class' }).click();
    await expect(form).toHaveCount(0);

    mkdirSync(folder);
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(notice(page)).toContainText('Saved TKB all classes.xlsx');
    // Try again didn't ask again.
    expect(await asked(app)).toHaveLength(1);
  });
  const workbook = await readWorkbook(path);
  expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
    '6A1',
    '6A2',
    '6A3',
    '7AA1',
    '8CE1',
    '9B1',
    '9BA1',
    'TKB tổng hợp',
    'Data ',
    'Giáo viên',
  ]);
  expect(workbook.getWorksheet('6A1')!.getCell('A5').value).toBe(
    'Trường/School: Trường Thử Nghiệm',
  );
});

test('Try again on This class asks again once the class is renamed, and not at all once it is deleted (R4-8 review)', async () => {
  seed(exampleSchool, 'c-6a1');
  const missing = join(out, 'not yet');
  await withApp(async (page, app) => {
    await standInForDialogs(app, [
      join(missing, 'TKB 6A1.xlsx'),
      join(out, 'TKB 6A9.xlsx'),
      join(missing, 'TKB 6A9.xlsx'),
    ]);
    const screens = page.getByRole('navigation', { name: 'Main' });
    const exportThisClass = async (name: string) => {
      await screens.getByRole('button', { name: 'Timetable' }).click();
      await openExport(page, 'This class as Excel');
      const dialog = page.getByRole('dialog', { name: `Export ${name} as Excel` });
      await dialog.getByRole('button', { name: 'Export anyway' }).click();
      await expect(dialog).toHaveCount(0);
    };

    await exportThisClass('6A1');
    let failed = page.getByRole('alert').filter({ hasText: "TKB 6A1.xlsx wasn't saved" });
    await expect(failed).toBeVisible();

    // Renamed: Try again asks where, suggesting the new name, rather than writing 6A9
    // under the old one.
    await screens.getByRole('button', { name: 'Classes' }).click();
    await page.getByRole('button', { name: 'Edit 6A1' }).click();
    const form = page.getByRole('dialog', { name: 'Edit 6A1' });
    await form.getByLabel('Name').fill('6A9');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toHaveCount(0);
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(notice(page)).toContainText('Saved TKB 6A9.xlsx');
    const askedFor = await asked(app);
    expect(askedFor).toHaveLength(2);
    expect(askedFor[1]).toMatch(/TKB 6A9\.xlsx$/);
    expect(existsSync(join(out, 'TKB 6A9.xlsx'))).toBe(true);

    // Deleted: the notice says so, with nothing to try again.
    await exportThisClass('6A9');
    failed = page.getByRole('alert').filter({ hasText: "TKB 6A9.xlsx wasn't saved" });
    await expect(failed).toBeVisible();
    await screens.getByRole('button', { name: 'Classes' }).click();
    await page.getByRole('button', { name: 'Delete 6A9' }).click();
    await page
      .getByRole('dialog', { name: 'Delete 6A9?' })
      .getByRole('button', { name: 'Delete class' })
      .click();
    await expect(failed).toContainText("6A9 has been deleted, so it can't be exported.");
    await expect(failed.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });
});

test('the export details are remembered per profile', async () => {
  seed(exampleSchool, 'c-6a1');
  await withApp(async (page, app) => {
    // A copy made before exporting has no details of its own.
    await page.getByRole('button', { name: 'Profile: Timetable' }).click();
    await page.getByRole('button', { name: 'Duplicate Timetable' }).click();
    await page
      .getByRole('dialog', { name: 'Duplicate Timetable' })
      .getByRole('button', { name: 'Duplicate' })
      .click();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Timetable' })
      .click();

    await standInForDialogs(app, [join(out, 'TKB 6A1.xlsx')]);
    await openExport(page, 'This class as Excel');
    let dialog = page.getByRole('dialog', { name: 'Export 6A1 as Excel' });
    await dialog.getByLabel('School', { exact: true }).fill('Trường Thử Nghiệm');
    await dialog.getByLabel('School year').fill('2027-2028');
    await dialog.getByLabel('Applies from').fill('2027-08-30');
    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    await expect(notice(page)).toContainText('Saved TKB 6A1.xlsx');

    // Next time the dialog starts with them, the year tidied.
    await openExport(page, 'This class as Excel');
    dialog = page.getByRole('dialog', { name: 'Export 6A1 as Excel' });
    await expect(dialog.getByLabel('School', { exact: true })).toHaveValue('Trường Thử Nghiệm');
    await expect(dialog.getByLabel('School year')).toHaveValue('2027 - 2028');
    await expect(dialog.getByLabel('Applies from')).toHaveValue('2027-08-30');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // The copy starts with the defaults.
    await page.getByRole('button', { name: 'Profile: Timetable' }).click();
    await page.getByRole('button', { name: 'Open Timetable copy' }).click();
    await openExport(page, 'This class as Excel');
    dialog = page.getByRole('dialog', { name: 'Export 6A1 as Excel' });
    await expect(dialog.getByLabel('School', { exact: true })).toHaveValue(
      'Trung học/Secondary School',
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  // And after a restart, the profile that exported still has them.
  await withApp(async (page) => {
    await page.getByRole('button', { name: 'Profile: Timetable copy' }).click();
    await page.getByRole('button', { name: 'Open Timetable', exact: true }).click();
    await openExport(page, 'This class as Excel');
    const dialog = page.getByRole('dialog', { name: 'Export 6A1 as Excel' });
    await expect(dialog.getByLabel('School', { exact: true })).toHaveValue('Trường Thử Nghiệm');
  });
});

test('the Export menu disables what there is nothing to export for', async () => {
  seed(exampleSchool, 'c-8ce1');
  await withApp(async (page) => {
    await page.getByRole('button', { name: 'Export' }).click();
    const menu = page.getByRole('menu', { name: 'Export' });
    await expect(menu.getByRole('group', { name: 'This class · 8CE1' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'All classes · 6' })).toBeVisible();
    // The first item has the focus, and the arrow keys move past the disabled PDF ones.
    const excel = menu.getByRole('menuitem', { name: 'This class as Excel' });
    await expect(excel).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'All classes as Excel' })).toBeFocused();
    // PDF comes with R4-6.
    await expect(menu.getByRole('menuitem', { name: 'This class as PDF' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'All classes as PDF' })).toBeDisabled();
    // Escape closes the menu and gives the button its focus back.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toBeFocused();
    // So does a click outside it.
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('heading', { level: 1 }).click();
    await expect(menu).toHaveCount(0);
  });

  rmSync(userData, { recursive: true, force: true });
  mkdirSync(userData);
  seed(createEmptyTimetable(), null);
  await withApp(async (page) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No classes yet');
    await page.getByRole('button', { name: 'Export' }).click();
    const menu = page.getByRole('menu', { name: 'Export' });
    await expect(menu.getByRole('group', { name: 'This class' })).toBeVisible();
    await expect(menu.getByRole('group', { name: 'All classes · 0' })).toBeVisible();
    for (const item of ['This class as Excel', 'All classes as Excel']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeDisabled();
    }
    // With nothing to pick, Escape still closes it.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toBeFocused();
  });
});
