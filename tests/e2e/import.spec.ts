import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import ExcelJS from 'exceljs';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { referenceWorkbook, referenceWorkbookData } from '../../fixtures/referenceWorkbook';
import { createAppState } from '../../src/domain/appState';
import { addClass } from '../../src/domain/classes';
import {
  importFoundRows,
  importNoticeText,
  importQuestion,
  importTimetable,
} from '../../src/domain/importTimetable';
import { suggestImport } from '../../src/domain/importWorkbook';
import type { TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import type { ExportResult, ImportFileResult, LoadResult, ProfileList } from '../../src/shared/ipc';
import { profileFolder, seedTimetable, unlockProfiles } from './dataFolder';

// Importing (IE-1, SYSTEM_DESIGN §12): choosing a workbook, with the system open dialog
// stood in for in the main process, the Import screen's choices and Test, and Import into a
// new or the open profile. Each test starts the app on its own data folder with
// TTM_USER_DATA.

let userData: string;
let out: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  out = mkdtempSync(join(tmpdir(), 'ttm-e2e-in-'));
});

test.afterEach(() => {
  unlockProfiles(userData);
  rmSync(userData, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

/** The open dialog's answers in turn: a path, or null for Cancel. */
async function standInForOpenDialog(app: ElectronApplication, answers: (string | null)[]) {
  await app.evaluate(({ dialog }, given) => {
    const fake = async () => {
      const path = given.shift() ?? null;
      return { canceled: path === null, filePaths: path === null ? [] : [path] };
    };
    Object.assign(dialog, { showOpenDialog: fake });
  }, answers);
}

test('a chosen workbook reaches the renderer as its sheets, and a cancel or an .xls does not', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('HK1').getCell('F1').value = '6A1';
  workbook.addWorksheet('ID GV 1S', { state: 'hidden' }).getCell('C2').value = 'Tên ngắn';
  const path = join(out, 'TKB.xlsx');
  await workbook.xlsx.writeFile(path);

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await standInForOpenDialog(app, [path, null, join(out, 'TKB.xls')]);
    const choose = () =>
      page.evaluate(() =>
        (
          globalThis as unknown as { api: { chooseImportFile(): Promise<ImportFileResult> } }
        ).api.chooseImportFile(),
      );

    expect(await choose()).toEqual({
      status: 'read',
      workbook: {
        fileName: 'TKB.xlsx',
        sheets: [
          { name: 'HK1', hidden: false, rows: [['', '', '', '', '', '6A1']] },
          { name: 'ID GV 1S', hidden: true, rows: [[], ['', '', 'Tên ngắn']] },
        ],
      },
    });
    expect(await choose()).toEqual({ status: 'cancelled' });
    expect(await choose()).toEqual({
      status: 'failed',
      fileName: 'TKB.xls',
      reason: "TKB.xls isn't an .xlsx workbook. Save it as .xlsx in Excel and choose it again.",
    });
  } finally {
    await app.close();
  }
});

test('saving the example asks where, writes the workbook, and leaves the timetable alone', async () => {
  const path = join(out, 'TKB example.xlsx');
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, answer) => {
      const fake = async (...args: unknown[]) => {
        const options = args.at(-1) as { defaultPath: string };
        (globalThis as unknown as { asked: string }).asked = options.defaultPath;
        return { canceled: false, filePath: answer };
      };
      Object.assign(dialog, { showSaveDialog: fake });
    }, path);

    const result = await page.evaluate(() =>
      (
        globalThis as unknown as { api: { saveExample(): Promise<ExportResult> } }
      ).api.saveExample(),
    );

    expect(result).toEqual({ status: 'saved', path, fileName: 'TKB example.xlsx', folder: out });
    const asked = await app.evaluate(() => (globalThis as unknown as { asked: string }).asked);
    expect(asked).toMatch(/TKB example\.xlsx$/);
    const loaded = await page.evaluate(() =>
      (
        globalThis as unknown as { api: { loadTimetable(): Promise<LoadResult> } }
      ).api.loadTimetable(),
    );
    expect(loaded).toMatchObject({ status: 'ok', file: { classes: [], teachers: [] } });
  } finally {
    await app.close();
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
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
  expect(workbook.getWorksheet('Giáo viên')?.getCell('C2').value).toBe('Cô Ngân');
});

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

/** The made-up workbook in the school's layout, saved as `name`. */
async function schoolFile(name = 'TKB school.xlsx') {
  const path = join(out, name);
  await referenceWorkbook().xlsx.writeFile(path);
  return path;
}

async function openImport(page: Page) {
  await page.getByTestId('profile-pill').click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import', exact: true })).toBeVisible();
}

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const results = (page: Page) => section(page, 'Results');
const importButton = (page: Page) =>
  results(page).getByRole('button', { name: 'Import', exact: true });
const testButton = (page: Page) => results(page).getByRole('button', { name: 'Test' });

test('the school layout opens with its suggestions', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    await expect(page.getByText('TKB school.xlsx · 5 sheets')).toBeVisible();
    // The header menu keeps no link active.
    await expect(page.getByRole('navigation').locator('[aria-current="page"]')).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('TKB school');

    const timetable = section(page, 'Timetable');
    await expect(timetable.getByLabel('Sheet')).toHaveValue('HK1');
    await expect(timetable.getByText('6 classes, Monday to Friday, 5 blocks a day')).toBeVisible();
    await expect(
      timetable.getByRole('radio', { name: 'The row under each subject' }),
    ).toBeChecked();
    // Timetable has no Leave out.
    await expect(timetable.getByLabel('Sheet').getByRole('option')).toHaveCount(5);

    const teachers = section(page, 'Teachers');
    await expect(teachers.getByLabel('Sheet')).toHaveValue('ID GV 1S');
    await expect(teachers.getByLabel('Header row')).toHaveValue('2');
    await expect(teachers.getByLabel('Short name column')).toHaveValue('2');
    await expect(teachers.getByLabel('Short name column').getByRole('option').first()).toHaveText(
      'A · TT',
    );
    await expect(teachers.getByRole('row', { name: /^Short name/ })).toContainText('Cô');

    const classes = section(page, 'Classes');
    await expect(classes.getByLabel('Sheet')).toHaveValue('Data ');
    await expect(classes.getByLabel('Header row')).toHaveValue('6');
    await expect(section(page, 'Teaching assignments').getByLabel('Sheet')).toHaveValue(
      'Phan cong',
    );

    await expect(results(page).getByText('Test checks the file with these choices.')).toBeVisible();
    await expect(importButton(page)).toBeDisabled();
  });
});

test('Test shows what it found and changes nothing, and Import waits for Test after a change', async () => {
  const path = await schoolFile();
  const data = referenceWorkbookData();
  const expected = importTimetable(data, suggestImport(data), createEmptyTimetable());
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    await testButton(page).click();
    await expect(results(page).locator('.import-found-rows > div')).toHaveText(
      importFoundRows(expected.summary, false).map(
        (row) => `${row.label}${row.value}${row.note === undefined ? '' : ` · ${row.note}`}`,
      ),
    );
    await expect(results(page).getByText('No problems found.')).toHaveCount(
      expected.problems.length === 0 ? 1 : 0,
    );
    await expect(importButton(page)).toBeEnabled();
    await expect(results(page).getByText('Test again after changing a choice.')).toHaveCount(0);

    // Clicking the option that's already chosen changes nothing.
    await page.getByRole('radio', { name: 'A new profile' }).click();
    await section(page, 'Timetable')
      .getByRole('radio', { name: 'The row under each subject' })
      .click();
    await expect(results(page).getByText('Test again after changing a choice.')).toHaveCount(0);
    await expect(importButton(page)).toBeEnabled();

    // A required column left out is said under it, and asks for Test again.
    const teachers = section(page, 'Teachers');
    await teachers.getByLabel('Short name column').selectOption({ label: 'Not imported' });
    await expect(teachers.getByText('Choose the column with the short names.')).toBeVisible();
    await expect(results(page).getByText('Test again after changing a choice.')).toBeVisible();
    await expect(importButton(page)).toBeDisabled();

    // Changing it back is tested again.
    await teachers.getByLabel('Short name column').selectOption({ label: 'C · HỌ TÊN' });
    await expect(importButton(page)).toBeEnabled();
    await teachers.getByLabel('Short name column').selectOption({ label: 'Not imported' });

    // Test lists the problem with its sheet, and Import can go ahead: problems never block.
    await testButton(page).click();
    await expect(
      results(page).getByRole('listitem').filter({ hasText: 'ID GV 1S' }).first(),
    ).toContainText('No column is chosen for the short name, so this sheet is left out.');
    await expect(importButton(page)).toBeEnabled();

    // Changing the header row or the sheet is a change too, and a sheet starts its columns
    // again from the suggestions.
    await teachers.getByLabel('Sheet').selectOption('Phan cong');
    await expect(importButton(page)).toBeDisabled();
    await teachers.getByLabel('Sheet').selectOption('ID GV 1S');
    await expect(teachers.getByLabel('Short name column')).toHaveValue('2');

    // Test didn't touch the timetable.
    const loaded = await page.evaluate(() =>
      (
        globalThis as unknown as { api: { loadTimetable(): Promise<LoadResult> } }
      ).api.loadTimetable(),
    );
    expect(loaded).toMatchObject({ status: 'ok', file: { classes: [], teachers: [] } });
  });
});

test('the open profile can be chosen, and a new profile needs a good name', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Timetable');
    await testButton(page).click();
    await expect(page.getByRole('alert')).toContainText('already');
    await expect(importButton(page)).toBeDisabled();
    // The name isn't a choice Test looks at, so a good one needs no Test again.
    await name.fill('The school');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(importButton(page)).toBeEnabled();

    // Into the open profile: no name, and Found says what's replaced and updated.
    await page.getByRole('radio', { name: 'Timetable (open now)' }).click();
    await expect(name).toHaveCount(0);
    await expect(importButton(page)).toBeDisabled();
    await testButton(page).click();
    await expect(results(page).getByText('Grids replaced')).toBeVisible();
    await expect(results(page).getByText('Updated', { exact: true })).toBeVisible();
    await expect(importButton(page)).toBeEnabled();
  });
});

test('Import stays disabled when Test finds nothing to bring in', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    await section(page, 'Timetable').getByLabel('Sheet').selectOption('ID GV 1S');
    await expect(
      section(page, 'Timetable').getByText("This sheet isn't laid out as a timetable."),
    ).toBeVisible();
    await testButton(page).click();
    await expect(results(page).getByText('so nothing is imported')).toBeVisible();
    await expect(importButton(page)).toBeDisabled();
    await expect(importButton(page)).toHaveAttribute(
      'title',
      'Nothing comes in with these choices.',
    );
  });
});

test('Teaching assignments can be chosen only with its sheet', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    const timetable = section(page, 'Timetable');
    const fromAssignments = timetable.getByRole('radio', { name: 'Teaching assignments' });
    await fromAssignments.click();
    await expect(fromAssignments).toBeChecked();

    // Leaving the sheet out goes back to the only choice left, with the reason as a tooltip.
    await section(page, 'Teaching assignments').getByLabel('Sheet').selectOption('');
    await expect(
      timetable.getByRole('radio', { name: 'The row under each subject' }),
    ).toBeChecked();
    await expect(fromAssignments).toBeDisabled();
    await expect(fromAssignments).toHaveAttribute(
      'title',
      'Choose a teaching assignments sheet first.',
    );
    await expect(section(page, 'Teaching assignments').getByRole('table')).toHaveCount(0);

    // The arrow keys pass over it.
    await timetable.getByRole('radio', { name: 'The row under each subject' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      timetable.getByRole('radio', { name: 'The row under each subject' }),
    ).toBeChecked();
  });
});

test('files that are cancelled or unreadable, another file, and the way back', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [
      null,
      join(out, 'TKB.xls'),
      path,
      null,
      await schoolFile('Second.xlsx'),
    ]);
    await page.getByTestId('profile-pill').click();
    const importPill = page.getByRole('button', { name: 'Import', exact: true });

    // Cancel stays on the profile screen, with focus still on Import.
    await importPill.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();
    await expect(importPill).toBeFocused();

    await importPill.click();
    await expect(page.getByRole('alert')).toContainText("TKB.xls couldn't be read");
    await expect(page.getByRole('alert')).toContainText("TKB.xls isn't an .xlsx workbook.");

    // A file that reads puts the failure away.
    await importPill.click();
    await expect(page.getByText('TKB school.xlsx · 5 sheets')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await section(page, 'Teachers').getByLabel('Sheet').selectOption('');
    await testButton(page).click();
    const another = page.getByRole('button', { name: 'Choose another file' });
    // Cancelling keeps this file and its choices.
    await another.click();
    await expect(another).toBeEnabled();
    await expect(section(page, 'Teachers').getByLabel('Sheet')).toHaveValue('');

    // Another file starts from its own suggestions.
    await another.click();
    await expect(page.getByText('Second.xlsx · 5 sheets')).toBeVisible();
    await expect(section(page, 'Teachers').getByLabel('Sheet')).toHaveValue('ID GV 1S');
    await expect(page.getByText('Test checks the file with these choices.')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Second');

    await page.getByRole('button', { name: 'Profiles' }).click();
    await expect(importPill).toBeFocused();
  });
});

test('a file still being read when the screen is left does not open the Import screen', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    // The dialog answers late, as a slow read would, giving time to leave.
    await app.evaluate(({ dialog }, answer) => {
      const fake = async () => {
        await new Promise((done) => setTimeout(done, 1500));
        return { canceled: false, filePaths: [answer] };
      };
      Object.assign(dialog, { showOpenDialog: fake });
    }, path);
    await page.getByTestId('profile-pill').click();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: 'Teachers', exact: true }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByRole('heading', { name: 'Teachers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Import', exact: true })).toHaveCount(0);
  });
});

test('a failed example save says why, and Try again writes it to the same place', async () => {
  const path = await schoolFile();
  const folder = join(out, 'later');
  const example = join(folder, 'Example.xlsx');
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await app.evaluate(({ dialog }, answer) => {
      const fake = async () => ({ canceled: false, filePath: answer });
      Object.assign(dialog, { showSaveDialog: fake });
    }, example);
    await openImport(page);

    await page.getByRole('button', { name: 'Download example' }).click();
    const failed = page.getByRole('alert');
    await expect(failed).toContainText("Example.xlsx wasn't saved");
    mkdirSync(folder);
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status')).toContainText('Saved Example.xlsx');
    expect(existsSync(example)).toBe(true);
  });
});

test('Download example saves the workbook and says so', async () => {
  const path = await schoolFile();
  const example = join(out, 'Example.xlsx');
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await app.evaluate(({ dialog }, answer) => {
      const fake = async () => ({ canceled: false, filePath: answer });
      Object.assign(dialog, { showSaveDialog: fake });
    }, example);
    await openImport(page);

    await page.getByRole('button', { name: 'Download example' }).click();
    await expect(page.getByRole('status')).toContainText('Saved Example.xlsx');
    expect(existsSync(example)).toBe(true);
    // Still on the Import screen, with a menu link the way out.
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import', exact: true })).toHaveCount(0);
  });
});

for (const [width, height] of [
  [1280, 720],
  [1440, 900],
] as const) {
  test(`the Import screen scrolls in its panels at ${width} x ${height}`, async () => {
    const path = await schoolFile();
    await withApp(async (page, app) => {
      await standInForOpenDialog(app, [path]);
      await app.evaluate(
        ({ BrowserWindow }, [w, h]) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(w as number, h as number);
        },
        [width, height],
      );
      await openImport(page);
      await testButton(page).click();

      const fits = await page.locator('html').evaluate((el) => el.scrollHeight <= el.clientHeight);
      expect(fits).toBe(true);
      // The footer stays on screen, inside the window.
      const foot = await testButton(page).boundingBox();
      expect((foot?.y ?? Infinity) + (foot?.height ?? 0)).toBeLessThanOrEqual(height);
      // The choices are longer than the panel at this size and scroll inside it.
      const scrolls = await page
        .locator('.import-choices')
        .evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(scrolls).toBe(true);
    });
  });
}

/** The open profile's saved timetable, once the half-second save has caught up. */
async function savedClassNames(expected: string[]) {
  await expect
    .poll(() => {
      const file = JSON.parse(
        readFileSync(join(profileFolder(userData), 'timetable.json'), 'utf8'),
      ) as TimetableFile;
      return file.classes.map((c) => c.name).sort();
    })
    .toEqual(expected);
}

/** The export notice's frame, which the import notice uses (the grid has a status region
    of its own). */
const notice = (page: Page) => page.locator('.export-notice');

/** The class bar's tiles for a grade, by name (a tile's text starts with its badges). */
async function expectTiles(page: Page, grade: number, names: string[]) {
  const tiles = page.locator(
    `[role="group"][aria-label="Grade ${grade} classes"] .class-tile[aria-label*="periods placed"]`,
  );
  await expect(tiles).toHaveCount(names.length);
  for (const [i, name] of names.entries()) {
    await expect(tiles.nth(i)).toHaveAttribute('aria-label', new RegExp(`^${name},`));
  }
}

/** The workbook's bytes and when it last changed, so a test can show importing left it be. */
const fileState = (path: string) => ({
  bytes: readFileSync(path).toString('base64'),
  modified: statSync(path).mtimeMs,
});

test('Import into a new profile makes it, opens it, and says what came in', async () => {
  const path = await schoolFile();
  const before = fileState(path);
  const data = referenceWorkbookData();
  const expected = importTimetable(data, suggestImport(data), createEmptyTimetable());
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);

    await testButton(page).click();
    await importButton(page).click();

    await expect(page.getByTestId('profile-pill')).toContainText('TKB school');
    await expect(notice(page)).toHaveAttribute('role', 'status');
    await expect(notice(page)).toHaveText(
      `${importNoticeText(expected.summary, 'TKB school')}Hide`,
    );
    await expectTiles(page, 6, ['6A1', '6A2']);
    const list = JSON.parse(readFileSync(join(userData, 'profiles.json'), 'utf8')) as {
      profiles: { id: string; name: string }[];
      openId: string;
    };
    expect(list.profiles.map((p) => p.name)).toEqual(['Timetable', 'TKB school']);
    expect(list.openId).toBe(list.profiles[1]!.id);
    await savedClassNames(expected.file.classes.map((c) => c.name).sort());

    // The profile it came from is as it was.
    const profiles = await page.evaluate(() =>
      (
        globalThis as unknown as { api: { listProfiles(): Promise<ProfileList> } }
      ).api.listProfiles(),
    );
    expect(profiles.profiles.map((p) => [p.name, p.classes])).toEqual([
      ['Timetable', 0],
      ['TKB school', expected.file.classes.length],
    ]);
    // Importing doesn't change the workbook.
    expect(fileState(path)).toEqual(before);
  });
});

test('Import into a new profile whose name was taken meanwhile says so and stays', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);
    await testButton(page).click();
    // Another profile takes the name after the screen checked it.
    await page.evaluate(() =>
      (
        globalThis as unknown as { api: { newProfile(name: string): Promise<unknown> } }
      ).api.newProfile('TKB school'),
    );
    await importButton(page).click();
    await expect(results(page).getByRole('alert')).toHaveText(
      "There's already a profile called TKB school.",
    );
    await expect(page.getByRole('heading', { name: 'Import', exact: true })).toBeVisible();
  });
});

test('Import into the open profile asks first, keeps a copy, and replaces only its classes', async () => {
  let state = createAppState(emptySchool());
  for (const name of ['6A1', '7B2']) {
    const added = addClass(state, name, () => `seed-${name}`);
    if (!added.ok) throw new Error(added.error);
    state = added.state;
  }
  const seeded = serializeTimetableFile(state.file);
  seedTimetable(userData, seeded);
  const path = await schoolFile();
  const data = referenceWorkbookData();
  const expected = importTimetable(data, suggestImport(data), state.file);
  const before = fileState(path);
  const question = importQuestion(expected.summary, 'Timetable');

  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    await openImport(page);
    await page.getByRole('radio', { name: 'Timetable (open now)' }).click();
    await testButton(page).click();

    // Cancel changes nothing.
    await importButton(page).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading')).toHaveText(question.title);
    await expect(dialog.locator('p')).toHaveText(question.lines);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    const kept = () =>
      readdirSync(profileFolder(userData)).filter((n) => n.startsWith('timetable.before-import-'));
    expect(kept()).toEqual([]);

    await importButton(page).click();
    await dialog.getByRole('button', { name: 'Import' }).click();

    // The timetable screen, with the notice.
    await expect(page.getByTestId('class-line')).toBeVisible();
    await expect(notice(page)).toHaveText(`${importNoticeText(expected.summary, 'Timetable')}Hide`);
    expect(kept()).toHaveLength(1);
    expect(readFileSync(join(profileFolder(userData), kept()[0]!), 'utf8')).toBe(seeded);
    // 7B2 isn't in the workbook, so it stays.
    await savedClassNames(expected.file.classes.map((c) => c.name).sort());
    expect(expected.file.classes.map((c) => c.name)).toContain('7B2');
    await expectTiles(page, 6, ['6A1', '6A2']);
    await page.getByRole('radio', { name: 'Grade 7' }).click();
    await expectTiles(page, 7, ['7AA1', '7B2']);
    expect(fileState(path)).toEqual(before);
  });
});

/** Opens the Import screen on the school file, into the open profile, and runs Test. */
async function testIntoOpen(page: Page) {
  await openImport(page);
  await page.getByRole('radio', { name: 'Timetable (open now)' }).click();
  await testButton(page).click();
  await expect(importButton(page)).toBeEnabled();
}

const beforeImportCopies = () =>
  readdirSync(profileFolder(userData)).filter((n) => n.startsWith('timetable.before-import-'));

test('Import into the open profile changes nothing when the copy or the save fails', async () => {
  test.skip(process.getuid?.() === 0, 'root can write to a read-only folder');
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path, path]);
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();
    chmodSync(profileFolder(userData), 0o555);

    // Nothing waits to be saved, so the copy is what fails.
    await testIntoOpen(page);
    await importButton(page).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
    const refusal = results(page).getByRole('alert');
    await expect(refusal).toContainText(
      "A copy of the timetable couldn't be kept, so nothing is imported.",
    );
    await expect(page.getByRole('heading', { name: 'Import', exact: true })).toBeVisible();
    expect(beforeImportCopies()).toEqual([]);
    // It goes once a choice changes.
    await section(page, 'Teachers').getByLabel('Sheet').selectOption('');
    await expect(refusal).toHaveCount(0);

    // A change that can't be saved stops the import before the copy.
    await page.getByRole('button', { name: 'Teachers', exact: true }).click();
    await page.getByRole('button', { name: 'Add teacher' }).click();
    await page.getByRole('dialog').getByLabel('Short name').fill('T. Hoa');
    await page.getByRole('dialog').getByRole('button', { name: 'Add teacher' }).click();
    await expect(page.locator('.save-notice.danger-notice').first()).toBeVisible();
    await page.getByTestId('profile-pill').click();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('radio', { name: 'Timetable (open now)' }).click();
    await testButton(page).click();
    await importButton(page).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
    await expect(results(page).getByRole('alert')).toHaveText(
      "Your latest changes aren't saved, so nothing is imported yet. Import tries saving them again.",
    );
    expect(beforeImportCopies()).toEqual([]);
    const saved = JSON.parse(
      readFileSync(join(profileFolder(userData), 'timetable.json'), 'utf8'),
    ) as TimetableFile;
    expect(saved.classes).toEqual([]);
  });
});

test('leaving the Import screen while the import is saving stops it, and says so', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path]);
    // Keeping the copy answers late, as a disk held by antivirus would, giving time to leave.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('import:keep-before');
      ipcMain.handle('import:keep-before', () => new Promise((done) => setTimeout(done, 1500)));
    });
    await testIntoOpen(page);
    await importButton(page).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Import' }).click();
    await expect(results(page).getByRole('button', { name: 'Importing…' })).toBeVisible();
    await page.getByRole('button', { name: 'Teachers', exact: true }).click();

    const alert = page.locator('.save-notice.danger-notice');
    await expect(alert).toContainText('Nothing was imported');
    await expect(alert).toContainText('The Import screen was closed before the import was in.');
    await expect(page.getByRole('heading', { name: 'Teachers' })).toBeVisible();
    await page.waitForTimeout(800);
    const saved = JSON.parse(
      readFileSync(join(profileFolder(userData), 'timetable.json'), 'utf8'),
    ) as TimetableFile;
    expect(saved.classes).toEqual([]);
  });
});

test('the choices are not remembered: importing the same file again starts from the suggestions', async () => {
  const path = await schoolFile();
  await withApp(async (page, app) => {
    await standInForOpenDialog(app, [path, path]);
    await openImport(page);
    await page.getByRole('radio', { name: 'Timetable (open now)' }).click();
    await section(page, 'Teachers').getByLabel('Sheet').selectOption('');
    await section(page, 'Classes').getByLabel('Header row').fill('7');
    // The changes took, so what follows shows they're not kept.
    await expect(page.getByRole('radio', { name: 'Timetable (open now)' })).toBeChecked();
    await expect(section(page, 'Teachers').getByLabel('Sheet')).toHaveValue('');
    await expect(section(page, 'Teachers').getByRole('table')).toHaveCount(0);
    await expect(
      section(page, 'Classes').getByText('Choose the column with the class names.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Profiles' }).click();

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'A new profile' })).toBeChecked();
    await expect(section(page, 'Teachers').getByLabel('Sheet')).toHaveValue('ID GV 1S');
    await expect(section(page, 'Classes').getByLabel('Header row')).toHaveValue('6');
    await expect(
      section(page, 'Classes').getByText('Choose the column with the class names.'),
    ).toHaveCount(0);
    await expect(page.getByText('Test checks the file with these choices.')).toBeVisible();
  });
});
