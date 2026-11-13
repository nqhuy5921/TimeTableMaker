import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { SAMPLE_PLACED } from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import type { TimetableFile } from '../../src/domain/model';
import { SCHEMA_VERSION, serializeTimetableFile } from '../../src/shared/fileFormat';
import { savedPath, unlockProfiles } from './dataFolder';
import { addGrade, gradesDialog } from './gradesDialog';
import { listRowTexts } from './listPage';

// The grade list (DM-8, SYSTEM_DESIGN §13): a new timetable starts with no grades, the
// class bar's tabs follow the list, and the Classes page's Grades dialog adds, edits, and
// deletes grades. Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  unlockProfiles(userData);
  rmSync(userData, { recursive: true, force: true });
});

async function withApp(run: (page: Page) => Promise<void>) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 720 });
    await run(page);
  } finally {
    await app.close();
  }
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const tabs = (page: Page) => page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio');
const menuLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const classBarHeight = async (page: Page) =>
  Math.round((await page.locator('.class-bar').boundingBox())?.height ?? 0);
const saved = () => JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;

test('a new timetable has no grades, and Add grades leads to adding them, then classes (DM-8)', async () => {
  // The class bar's height with grades, to compare with the empty one.
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  let withGrades = 0;
  await withApp(async (page) => {
    await expect(tabs(page)).toHaveCount(4);
    withGrades = await classBarHeight(page);
  });
  rmSync(userData, { recursive: true, force: true });
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));

  await withApp(async (page) => {
    // No tabs and no New class tile, but the way to add a grade, in a bar as tall as ever.
    await expect(title(page)).toHaveText('No classes yet');
    await expect(page.getByText('No grades yet.')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Grade' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New class' })).toHaveCount(0);
    expect(await classBarHeight(page)).toBe(withGrades);

    // Add grades opens the Classes page with its Grades dialog.
    await page.getByRole('button', { name: 'Add grades' }).click();
    await expect(gradesDialog(page)).toBeVisible();
    await expect(menuLink(page, 'Classes')).toHaveAttribute('aria-current', 'page');
    await expect(gradesDialog(page)).toContainText('No grades yet. Add one, then add its classes.');
    await expect(gradesDialog(page).getByRole('button', { name: 'Add grade' })).toBeFocused();

    // The form's messages, then two grades, listed in number order.
    await gradesDialog(page).getByRole('button', { name: 'Add grade' }).click();
    const form = page.getByRole('dialog', { name: 'Add grade' });
    await expect(form.getByLabel('Grade')).toBeFocused();
    await form.getByRole('button', { name: 'Add grade' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a grade from 1 to 12.');
    await form.getByLabel('Grade').fill('13');
    await form.getByRole('button', { name: 'Add grade' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a grade from 1 to 12.');
    // Escape goes back to the list, not out of the dialog.
    await page.keyboard.press('Escape');
    await expect(gradesDialog(page).getByRole('button', { name: 'Add grade' })).toBeFocused();
    await addGrade(page, '10');
    await addGrade(page, '7');
    await gradesDialog(page).getByRole('button', { name: 'Add grade' }).click();
    await form.getByLabel('Grade').fill('10');
    await form.getByRole('button', { name: 'Add grade' }).click();
    await expect(form.getByRole('alert')).toHaveText("There's already a Grade 10.");
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(gradesDialog(page).getByRole('listitem')).toHaveText([
      /^Grade 7No classes/,
      /^Grade 10No classes/,
    ]);

    // Escape on the list closes the dialog, with focus back on Grades.
    await page.keyboard.press('Escape');
    await expect(gradesDialog(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Grades', exact: true })).toBeFocused();
    await expect.poll(() => saved().grades).toEqual([7, 10]);

    // The tabs are the list, a grade with no classes keeping its tab.
    await menuLink(page, 'Timetable').click();
    await expect(tabs(page)).toHaveText(['Grade 7', 'Grade 10']);
    await expect(tabs(page).first()).toBeChecked();

    // New class names the grades, and takes only a listed one.
    await page.getByRole('button', { name: 'New class' }).click();
    const newClass = page.getByRole('dialog', { name: 'New class' });
    await expect(newClass.getByLabel('Class name')).toHaveAccessibleDescription(
      'Grade 7 or 10, a track, and a section, as in 7A1 or 10CE2.',
    );
    await newClass.getByLabel('Class name').fill('6A1');
    await newClass.getByRole('button', { name: 'Add class' }).click();
    await expect(newClass.getByRole('alert')).toHaveText(
      "There's no Grade 6 yet. Add it with Grades on the Classes page.",
    );
    await newClass.getByLabel('Class name').fill('10A1');
    await newClass.getByRole('button', { name: 'Add class' }).click();
    await expect(title(page)).toHaveText('10A1');
    await expect(tabs(page)).toHaveText(['Grade 7', 'Grade 10']);
    await expect(page.getByRole('radio', { name: 'Grade 10' })).toBeChecked();
    await page.getByRole('radio', { name: 'Grade 7' }).click();
    await expect(page.getByRole('group', { name: 'Grade 7 classes' })).toBeVisible();
  });
});

test('with no grades, Add class waits for one (DM-8)', async () => {
  await withApp(async (page) => {
    await menuLink(page, 'Classes').click();
    const add = page.getByRole('button', { name: 'Add class' });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute('title', 'Add a grade first, with Grades.');
    await expect(
      page.getByText('Add a grade with Grades above, then its classes with Add class.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Grades', exact: true }).click();
    await addGrade(page, '6');
    await gradesDialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(add).toBeEnabled();
  });
});

test("a version 5 timetable opens with its classes' grades, which edit and delete with their classes (DM-8)", async () => {
  const v5: Record<string, unknown> = { ...exampleSchool, schemaVersion: 5 };
  delete v5.grades;
  writeFileSync(join(userData, 'timetable.json'), JSON.stringify(v5));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ selectedClassId: 'c-6a1' }));

  await withApp(async (page) => {
    await expect(title(page)).toHaveText('6A1');
    await expect(tabs(page)).toHaveText(['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9']);

    await menuLink(page, 'Classes').click();
    await page.getByRole('button', { name: 'Grades', exact: true }).click();
    await expect(gradesDialog(page).getByRole('listitem')).toHaveText([
      /^Grade 62 classes/,
      /^Grade 71 class/,
      /^Grade 81 class/,
      /^Grade 92 classes/,
    ]);

    // Edit says how its classes are renamed, then renames them, keeping their grids.
    await gradesDialog(page).getByRole('button', { name: 'Edit Grade 6' }).click();
    const form = page.getByRole('dialog', { name: 'Edit Grade 6' });
    await expect(form).toContainText('Its 2 classes are renamed to match.');
    await form.getByLabel('Grade').fill('11');
    await expect(form.getByLabel('Grade')).toHaveAccessibleDescription(
      'Its 2 classes are renamed to match, so 6A1 becomes 11A1.',
    );
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(gradesDialog(page).getByRole('button', { name: 'Edit Grade 11' })).toBeFocused();

    // Delete asks first, naming the classes and their periods, and Keep keeps it.
    await gradesDialog(page).getByRole('button', { name: 'Delete Grade 7' }).click();
    const question = page.getByRole('dialog', { name: 'Delete Grade 7?' });
    await expect(question).toContainText('Its class 7AA1 goes with it.');
    await expect(question).toContainText(
      `${SAMPLE_PLACED['7AA1']} periods placed on its grid are taken off; the cards stay in the pool.`,
    );
    await expect(question.getByRole('button', { name: 'Keep the grade' })).toBeFocused();
    await question.getByRole('button', { name: 'Keep the grade' }).click();
    await expect(gradesDialog(page).getByRole('button', { name: 'Delete Grade 7' })).toBeFocused();
    await gradesDialog(page).getByRole('button', { name: 'Delete Grade 7' }).click();
    await question.getByRole('button', { name: 'Delete grade' }).click();
    await expect(gradesDialog(page).getByRole('button', { name: 'Add grade' })).toBeFocused();
    await expect(gradesDialog(page).getByRole('listitem')).toHaveText([
      /^Grade 81 class/,
      /^Grade 92 classes/,
      /^Grade 112 classes/,
    ]);
    await gradesDialog(page).getByRole('button', { name: 'Close' }).click();
    expect((await listRowTexts(page, 'Classes')).map((row) => row.split(' | ')[0])).toEqual([
      '8CE1',
      '9B1',
      '9BA1',
      '11A1',
      '11A2',
    ]);

    // The class on screen was renamed with its grade, and its grid is as it was.
    await menuLink(page, 'Timetable').click();
    await expect(title(page)).toHaveText('11A1');
    await expect(page.getByTestId('placed-count')).toHaveText(`${SAMPLE_PLACED['6A1']}/50`);
    await expect(tabs(page)).toHaveText(['Grade 8', 'Grade 9', 'Grade 11']);
    await expect(page.getByRole('radio', { name: 'Grade 11' })).toBeChecked();

    await expect.poll(() => saved().schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved().grades).toEqual([8, 9, 11]);
    expect(saved().classes.some((c) => c.grade === 7 || c.grade === 6)).toBe(false);
  });
});
