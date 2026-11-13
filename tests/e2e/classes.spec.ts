import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import type { TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { listRowTexts } from './listPage';

async function addClass(page: Page, name: string) {
  await page.getByRole('button', { name: 'New class' }).click();
  const dialog = page.getByRole('dialog', { name: 'New class' });
  await dialog.getByLabel('Class name').fill(name);
  await dialog.getByRole('button', { name: 'Add class' }).click();
}

test('adds classes and switches between them (TB-1, DM-2)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  // A timetable with grades 6 to 9 and no classes; a new one has no grades (DM-8).
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    const title = page.getByRole('heading', { level: 1 });
    const grades = page.getByRole('radiogroup', { name: 'Grade' });
    const newClass = page.getByRole('button', { name: 'New class' });

    // No classes yet: Grade 6 is chosen and its row only has New class.
    await expect(title).toHaveText('No classes yet');
    await expect(grades.getByRole('radio')).toHaveText([
      'Grade 6',
      'Grade 7',
      'Grade 8',
      'Grade 9',
    ]);
    await expect(grades.getByRole('radio', { name: 'Grade 6' })).toBeChecked();
    await expect(page.getByTestId('placed-count')).toHaveCount(0);
    await newClass.click();
    const dialog = page.getByRole('dialog', { name: 'New class' });
    await expect(dialog.getByLabel('Class name')).toBeFocused();

    // The name rule's messages, then a good name.
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a class name.');
    await dialog.getByLabel('Class name').fill('6C1');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByRole('alert')).toContainText('a track (A, AA, CE, B, or BA)');
    await dialog.getByLabel('Class name').fill('6A1');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(title).toHaveText('6A1');
    await expect(page.getByText('Grade 6 · Track A')).toBeVisible();
    await expect(page.getByTestId('placed-count')).toHaveText('0/50');
    await expect(page.getByText('No subjects yet')).toBeVisible();
    await expect(newClass).toBeFocused();

    // A class in another grade switches the grade tabs to it.
    await addClass(page, '7B2');
    await expect(title).toHaveText('7B2');
    await expect(grades.getByRole('radio', { name: 'Grade 7' })).toBeChecked();
    const tile = (name: string) => page.getByRole('button', { name: new RegExp(`^${name},`) });
    await expect(tile('7B2')).toHaveAttribute('aria-current', 'true');
    await expect(tile('7B2')).toHaveAccessibleName('7B2, 0 of 50 periods placed');
    await expect(tile('6A1')).toHaveCount(0);

    // A name that's already taken, then Escape.
    await addClass(page, '6A1');
    await expect(dialog.getByRole('alert')).toHaveText("There's already a class called 6A1.");
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(title).toHaveText('7B2');

    // Looking at Grade 6 doesn't switch class until a tile is picked.
    await grades.getByRole('radio', { name: 'Grade 6' }).click();
    await expect(title).toHaveText('7B2');
    await expect(tile('6A1')).not.toHaveAttribute('aria-current', 'true');
    await tile('6A1').click();
    await expect(title).toHaveText('6A1');
    await expect(tile('6A1')).toHaveAttribute('aria-current', 'true');

    // A grade with no classes has only New class.
    await grades.getByRole('radio', { name: 'Grade 9' }).click();
    await expect(
      page.getByRole('group', { name: 'Grade 9 classes' }).getByRole('button'),
    ).toHaveText(['New class']);

    // The class survives a trip to another screen, with the grade tabs back on its grade.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button', { name: 'Cards' }).click();
    await nav.getByRole('button', { name: 'Timetable' }).click();
    await expect(title).toHaveText('6A1');
    await expect(grades.getByRole('radio', { name: 'Grade 6' })).toBeChecked();
    await expect(page.getByTestId('slot')).toHaveCount(25);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

// The Classes page (DM-2, release 3). Made-up names only.

/** Two teachers and three classes. 6A1 has Cô Ngân as homeroom teacher and Thầy Phúc as
    assistant, and a full block and a half placed (3 periods); 6A2 has nothing placed;
    7B1 has Thầy Phúc as homeroom teacher. */
function seedSchool(userData: string): void {
  const file: TimetableFile = {
    ...emptySchool(),
    subjects: [{ id: 'toan', name: 'Toán', colorKey: 'math' }],
    teachers: [
      { id: 'ngan', shortName: 'Cô Ngân', fullName: 'Lê Thị Ngân', conditions: [] },
      { id: 'phuc', shortName: 'Thầy Phúc', conditions: [] },
    ],
    classes: [
      {
        id: 'c1',
        name: '6A1',
        grade: 6,
        track: 'A',
        section: 1,
        formTeacherId: 'ngan',
        coTeacherId: 'phuc',
      },
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
      { id: 'c3', name: '7B1', grade: 7, track: 'B', section: 1, formTeacherId: 'phuc' },
    ],
    cards: [{ id: 'k1', subjectId: 'toan', teacherId: 'phuc', roomId: null }],
    placements: [
      { id: 'p1', cardId: 'k1', classId: 'c1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k1', classId: 'c1', day: 1, block: 0, part: 'first' },
    ],
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
}

async function withSchool(run: (page: Page, userData: string) => Promise<void>) {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  seedSchool(userData);
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    await run(await app.firstWindow(), userData);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

const openScreen = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
const classTable = (page: Page) => page.getByRole('table', { name: 'Classes' });

function savedFile(userData: string): TimetableFile {
  return JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;
}

test('the Classes page lists classes with their teachers and searches them (DM-2)', async () => {
  await withSchool(async (page) => {
    await openScreen(page, 'Classes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Classes');
    await expect(page.getByText('3 classes')).toBeVisible();
    await expect(classTable(page).getByRole('columnheader')).toHaveText([
      'Class',
      'Grade',
      'Homeroom teacher',
      'Assistant homeroom teacher',
      'Placed',
      'Errors',
      'Actions',
    ]);
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toEqual([
        '6A1 | 6 | Cô Ngân | Thầy Phúc | 3/50 | ',
        '6A2 | 6 | — | — | 0/50 | ',
        '7B1 | 7 | Thầy Phúc | — | 0/50 | ',
      ]);

    // The search finds a class by name or by either teacher, ignoring case and accents.
    const search = page.getByRole('searchbox', { name: 'Search classes' });
    await search.fill('le thi');
    await expect.poll(() => listRowTexts(page, 'Classes')).toHaveLength(1);
    await search.fill('phuc');
    await expect.poll(() => listRowTexts(page, 'Classes')).toHaveLength(2);
    await search.fill('7b');
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toEqual(['7B1 | 7 | Thầy Phúc | — | 0/50 | ']);
    await search.fill('nobody');
    await expect(page.getByText('No class matches “nobody”.')).toBeVisible();

    // The search starts empty on the next visit, as on the Teachers page.
    await openScreen(page, 'Timetable');
    await openScreen(page, 'Classes');
    await expect(page.getByRole('searchbox', { name: 'Search classes' })).toHaveValue('');
  });
});

test('Add class needs a homeroom teacher and puts the class on screen (DM-2)', async () => {
  await withSchool(async (page, userData) => {
    await openScreen(page, 'Classes');
    await page.getByRole('button', { name: 'Add class' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add class' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await dialog.getByLabel('Name').fill('8CE1');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose a homeroom teacher.');

    // The assistant can't be the homeroom teacher.
    await dialog.getByLabel('Homeroom teacher', { exact: true }).selectOption('Cô Ngân');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByLabel(/Assistant homeroom teacher/).selectOption('Cô Ngân');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Pick a teacher other than the homeroom teacher.',
    );
    await dialog.getByLabel(/Assistant homeroom teacher/).selectOption('None');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add class' })).toBeFocused();
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toContain('8CE1 | 8 | Cô Ngân | — | 0/50 | ');
    await expect
      .poll(() => savedFile(userData).classes.find((c) => c.name === '8CE1'))
      .toMatchObject({ grade: 8, track: 'CE', section: 1, formTeacherId: 'ngan' });

    // The new class is on the timetable screen, with its homeroom teacher in the class line.
    await openScreen(page, 'Timetable');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('8CE1');
    await expect(page.getByText('Grade 8 · Track CE · Homeroom teacher Cô Ngân')).toBeVisible();
  });
});

test('Edit renames a class into another grade and keeps its grid (DM-2)', async () => {
  await withSchool(async (page) => {
    await openScreen(page, 'Classes');
    await page.getByRole('button', { name: 'Edit 6A1' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit 6A1' });
    await expect(dialog.getByLabel('Homeroom teacher', { exact: true })).toHaveValue('ngan');
    await expect(dialog.getByLabel(/Assistant homeroom teacher/)).toHaveValue('phuc');
    await dialog.getByLabel('Name').fill('7B1');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText("There's already a class called 7B1.");
    await dialog.getByLabel('Name').fill('9BA2');
    await dialog.getByLabel(/Assistant homeroom teacher/).selectOption('None');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit 9BA2' })).toBeFocused();
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toEqual([
        '6A2 | 6 | — | — | 0/50 | ',
        '7B1 | 7 | Thầy Phúc | — | 0/50 | ',
        '9BA2 | 9 | Cô Ngân | — | 3/50 | ',
      ]);

    // On the timetable, the class is in grade 9 with its grid as it was.
    await openScreen(page, 'Timetable');
    const grades = page.getByRole('radiogroup', { name: 'Grade' });
    await grades.getByRole('radio', { name: 'Grade 9' }).click();
    await page.getByRole('button', { name: /^9BA2,/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('9BA2');
    await expect(page.getByTestId('placed-count')).toContainText('3');
  });
});

test('Delete asks first, with focus on Keep, and takes the placements with it (DM-2)', async () => {
  await withSchool(async (page, userData) => {
    // 6A1 is on screen when the app opens (the first class by grade).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    await openScreen(page, 'Classes');
    await page.getByRole('button', { name: 'Delete 6A1' }).click();
    const question = page.getByRole('dialog', { name: 'Delete 6A1?' });
    await expect(
      question.getByText(
        "3 periods are placed in 6A1. They'll be taken off its grid; the cards stay in the pool.",
      ),
    ).toBeVisible();
    await expect(question.getByRole('button', { name: 'Keep the class' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete 6A1' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Classes')).toHaveLength(3);

    await page.getByRole('button', { name: 'Delete 6A1' }).click();
    await question.getByRole('button', { name: 'Delete class' }).click();
    await expect.poll(() => listRowTexts(page, 'Classes')).toHaveLength(2);
    await expect(page.getByRole('button', { name: 'Add class' })).toBeFocused();
    await expect
      .poll(() => {
        const file = savedFile(userData);
        return [file.classes.length, file.placements.length, file.cards.length];
      })
      .toEqual([2, 0, 1]);

    // A class with nothing placed asks plainly.
    await page.getByRole('button', { name: 'Delete 6A2' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Delete 6A2?' }).getByText('Nothing is placed in 6A2.'),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // The timetable shows the first class by grade in place of the deleted one.
    await openScreen(page, 'Timetable');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A2');
  });
});

test('with no teachers yet, the class form says where to add one (DM-2)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  // A timetable with grades 6 to 9 and no classes; a new one has no grades (DM-8).
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await openScreen(page, 'Classes');
    await expect(page.getByText('No classes yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add class' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add class' });
    // The note is read with the dropdown, and the class bar's hint is the same as this one.
    await expect(
      dialog.getByLabel('Homeroom teacher', { exact: true }),
    ).toHaveAccessibleDescription('There are no teachers yet. Add one on the Teachers page first.');
    await expect(dialog.getByLabel('Name')).toHaveAccessibleDescription(
      'Grade 6, 7, 8, or 9, a track, and a section, as in 6A1 or 8CE2.',
    );
    await dialog.getByLabel('Name').fill('6A1');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose a homeroom teacher.');
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

test('deleting a teacher names the classes they stop being homeroom or assistant of (DM-1, DM-2)', async () => {
  await withSchool(async (page) => {
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(
      page
        .getByRole('dialog')
        .getByText(
          'Thầy Phúc stops being homeroom teacher of 7B1 and assistant homeroom teacher of 6A1.',
        ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Delete teacher' }).click();

    // Both classes lose him; 6A1 keeps its homeroom teacher.
    await openScreen(page, 'Classes');
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toEqual([
        '6A1 | 6 | Cô Ngân | — | 3/50 | ',
        '6A2 | 6 | — | — | 0/50 | ',
        '7B1 | 7 | — | — | 0/50 | ',
      ]);
  });
});
