import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath, seedTimetable } from './dataFolder';
import type { TeacherCondition, TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// Teacher conditions on the teacher detail screen (TC-1, release 2). Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

async function withApp(run: (page: Page) => Promise<void>) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    await run(await app.firstWindow());
  } finally {
    await app.close();
  }
}

/** Thầy Phúc teaches Toán and Tin học; nobody teaches Ngữ văn. `withCards: false` leaves
    him with no cards. */
function seed(conditions: TeacherCondition[] = [], withCards = true) {
  const file: TimetableFile = {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
      { id: 'tin', name: 'Tin học', colorKey: 'informatics' },
    ],
    teachers: [{ id: 'phuc', shortName: 'Thầy Phúc', conditions }],
    cards: withCards
      ? [
          { id: 'k-toan', subjectId: 'toan', teacherId: 'phuc', roomId: null },
          { id: 'k-van', subjectId: 'van', teacherId: null, roomId: null },
          { id: 'k-tin', subjectId: 'tin', teacherId: 'phuc', roomId: null },
        ]
      : [],
  };
  seedTimetable(userData, serializeTimetableFile(file));
}

/** The saved teacher's conditions, once the half-second save has caught up. */
async function savedConditions(check: (conditions: TeacherCondition[]) => boolean) {
  let conditions: TeacherCondition[] = [];
  await expect
    .poll(() => {
      const file = JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;
      conditions = file.teachers[0]!.conditions;
      return check(conditions);
    })
    .toBe(true);
  return conditions;
}

async function openTeacher(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Teachers' })
    .click();
  await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thầy Phúc');
}

const panel = (page: Page) => page.getByRole('region', { name: 'Conditions' });
const sentences = (page: Page) => panel(page).locator('.condition-sentence');
const form = (page: Page) => page.getByRole('dialog');
const addButton = (page: Page) =>
  panel(page).getByRole('button', { name: 'Add condition', exact: true });
const submit = (dialog: Locator) => dialog.getByRole('button', { name: /^(Add condition|Save)$/ });
const chip = (dialog: Locator, group: string, name: string) =>
  dialog.getByRole('group', { name: group }).getByRole('button', { name, exact: true });

test('every condition type is added through the form and listed as its sentence (TC-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openTeacher(page);
    await expect(panel(page).getByText('No conditions yet')).toBeVisible();

    // Subject limit: a subject, a number, and a day or a week, with a live preview.
    await addButton(page).click();
    let dialog = form(page);
    await expect(dialog.getByRole('heading')).toHaveText('Add condition · Thầy Phúc');
    await expect(dialog.getByLabel('Condition')).toHaveValue('subjectLimit');
    await expect(dialog.getByText('Pick a subject to see the sentence.')).toBeVisible();
    // Only the subjects he has cards for, not Ngữ văn (2026-10-23).
    await expect(dialog.getByLabel('Subject').locator('option')).toHaveText([
      'Choose a subject',
      'Toán',
      'Tin học',
    ]);
    await dialog.getByLabel('Subject').selectOption({ label: 'Toán' });
    await dialog.getByRole('spinbutton').fill('3');
    await dialog.getByRole('radio', { name: 'a week' }).click();
    await expect(dialog.locator('.condition-preview')).toContainText(
      'At most 3 periods of Toán a week',
    );
    await submit(dialog).click();
    await expect(dialog).toBeHidden();
    // Focus goes back to Add condition.
    await expect(addButton(page)).toBeFocused();

    // Unavailable times: the afternoon, every day to start.
    await addButton(page).click();
    dialog = form(page);
    await dialog.getByLabel('Condition').selectOption('unavailable');
    await expect(
      dialog.getByText("Can't teach in the morning, afternoon, or chosen blocks."),
    ).toBeVisible();
    await dialog.getByRole('radio', { name: 'Afternoon' }).click();
    await submit(dialog).click();
    await expect(dialog).toBeHidden();

    // Unavailable times: chosen blocks on chosen days.
    await addButton(page).click();
    dialog = form(page);
    await dialog.getByLabel('Condition').selectOption('unavailable');
    await dialog.getByRole('radio', { name: 'Chosen blocks' }).click();
    for (const block of ['3-4', '5-6']) await chip(dialog, 'Blocks', block).click();
    for (const day of ['Tue', 'Wed', 'Thu', 'Fri']) await chip(dialog, 'Days', day).click();
    await expect(chip(dialog, 'Blocks', '1-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.condition-preview')).toContainText(
      "Can't teach in periods 1–2 on Monday",
    );
    await submit(dialog).click();
    await expect(dialog).toBeHidden();

    // Days off: no day to start.
    await addButton(page).click();
    dialog = form(page);
    await dialog.getByLabel('Condition').selectOption('daysOff');
    await expect(chip(dialog, 'Days', 'Mon')).toHaveAttribute('aria-pressed', 'false');
    await chip(dialog, 'Days', 'Fri').click();
    await chip(dialog, 'Days', 'Wed').click();
    await submit(dialog).click();
    await expect(dialog).toBeHidden();

    // The five counted types, at their defaults.
    for (const type of [
      'Most periods per day',
      'Most periods per week',
      'Most blocks in a row',
      'Most gaps per day',
      'Most teaching days',
    ]) {
      await addButton(page).click();
      dialog = form(page);
      await dialog.getByLabel('Condition').selectOption({ label: type });
      await submit(dialog).click();
      await expect(dialog).toBeHidden();
    }

    await expect(sentences(page)).toHaveText([
      'At most 3 periods of Toán a week',
      "Can't teach in the afternoon on any day",
      "Can't teach in periods 1–2 on Monday",
      'Not on Wednesday or Friday',
      'At most 6 periods on any day',
      'At most 18 periods a week',
      'At most 2 blocks in a row',
      'At most 1 free block between lessons in a day',
      'Teaches on at most 4 days a week',
    ]);
    await expect(panel(page).locator('.teacher-panel-head')).toContainText('9');

    const saved = await savedConditions((list) => list.length === 9);
    expect(saved.map((c) => ({ ...c, id: undefined }))).toEqual([
      { id: undefined, on: true, type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' },
      { id: undefined, on: true, type: 'unavailable', blocks: [3, 4], days: [0, 1, 2, 3, 4] },
      { id: undefined, on: true, type: 'unavailable', blocks: [0], days: [0] },
      { id: undefined, on: true, type: 'daysOff', days: [2, 4] },
      { id: undefined, on: true, type: 'maxPeriodsPerDay', max: 6 },
      { id: undefined, on: true, type: 'maxPeriodsPerWeek', max: 18 },
      { id: undefined, on: true, type: 'maxBlocksInRow', max: 2 },
      { id: undefined, on: true, type: 'maxGapsPerDay', max: 1 },
      { id: undefined, on: true, type: 'maxTeachingDays', max: 4 },
    ]);
  });
});

test('values out of range are refused with the field’s message (TC-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openTeacher(page);
    await addButton(page).click();
    const dialog = form(page);

    // No subject picked.
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pick a subject.');
    await dialog.getByLabel('Subject').selectOption({ label: 'Tin học' });
    await expect(dialog.getByRole('alert')).toBeHidden();

    // A subject limit a day is 1 to 10, a week 1 to 50.
    await dialog.getByRole('spinbutton').fill('11');
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 1 to 10.');
    await submit(dialog).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'a week' }).click();
    await expect(dialog.getByRole('alert')).toBeHidden();

    // Changing the type keeps the number, which can then be out of range.
    await dialog.getByLabel('Condition').selectOption({ label: 'Most periods per day' });
    await expect(dialog.getByRole('spinbutton')).toHaveValue('11');
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 1 to 10.');
    await expect(dialog.getByRole('spinbutton')).toBeFocused();
    await dialog.getByRole('spinbutton').fill('');
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 1 to 10.');
    await dialog.getByLabel('Condition').selectOption({ label: 'Most blocks in a row' });
    await dialog.getByRole('spinbutton').fill('4');
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 1 to 3.');
    await dialog.getByLabel('Condition').selectOption({ label: 'Most gaps per day' });
    await dialog.getByRole('spinbutton').fill('-1');
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 0 to 3.');
    // Only plain digits count: 1e1 isn't taken as 10.
    await dialog.getByLabel('Condition').selectOption({ label: 'Most periods per day' });
    await dialog.getByRole('spinbutton').fill('1e1');
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a whole number from 1 to 10.');

    // Days off and unavailable times need a day, and chosen blocks a block.
    await dialog.getByLabel('Condition').selectOption('daysOff');
    await submit(dialog).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pick at least one day.');
    await expect(dialog.getByText('Pick the days to see the sentence.')).toBeVisible();
    await dialog.getByLabel('Condition').selectOption('unavailable');
    await dialog.getByRole('radio', { name: 'Chosen blocks' }).click();
    for (const block of ['1-2', '3-4', '5-6']) await chip(dialog, 'Blocks', block).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pick at least one block.');
    await submit(dialog).click();
    await expect(dialog).toBeVisible();

    // Nothing was added.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel(page).getByText('No conditions yet')).toBeVisible();
  });
});

test('a condition switches off and on, edits in the same form, and deletes after asking (TC-1)', async () => {
  seed([
    { id: 'a', on: true, type: 'maxPeriodsPerDay', max: 6 },
    { id: 'b', on: true, type: 'subjectLimit', subjectId: 'toan', max: 3, per: 'week' },
    { id: 'c', on: true, type: 'subjectLimit', subjectId: 'tin', max: 2, per: 'day' },
  ]);
  await withApp(async (page) => {
    await openTeacher(page);
    await expect(sentences(page)).toHaveText([
      'At most 6 periods on any day',
      'At most 3 periods of Toán a week',
      'At most 2 periods of Tin học a day',
    ]);

    // Off, then on again.
    const toggle = panel(page).getByRole('switch', { name: 'At most 6 periods on any day' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(sentences(page).nth(0)).toHaveText('At most 6 periods on any day · Off');
    await savedConditions((list) => list[0]!.on === false);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(sentences(page).nth(0)).toHaveText('At most 6 periods on any day');
    await savedConditions((list) => list[0]!.on === true);

    // Edit reopens the form with the values filled in.
    await toggle.click();
    await panel(page)
      .getByRole('button', { name: 'Edit “At most 3 periods of Toán a week”' })
      .click();
    const dialog = form(page);
    await expect(dialog.getByRole('heading')).toHaveText('Edit condition · Thầy Phúc');
    await expect(dialog.getByLabel('Condition')).toHaveValue('subjectLimit');
    await expect(dialog.getByLabel('Subject')).toHaveValue('toan');
    await expect(dialog.getByRole('spinbutton')).toHaveValue('3');
    await expect(dialog.getByRole('radio', { name: 'a week' })).toBeChecked();
    await dialog.getByRole('spinbutton').fill('4');
    await dialog.getByRole('radio', { name: 'a day' }).click();
    await submit(dialog).click();
    await expect(dialog).toBeHidden();
    await expect(sentences(page)).toHaveText([
      'At most 6 periods on any day · Off',
      'At most 4 periods of Toán a day',
      'At most 2 periods of Tin học a day',
    ]);
    // Focus goes back to the row's Edit, now named for the new sentence.
    await expect(
      panel(page).getByRole('button', { name: 'Edit “At most 4 periods of Toán a day”' }),
    ).toBeFocused();

    // Cancel leaves it alone; Delete asks first, naming it.
    const deleteButton = panel(page).getByRole('button', {
      name: 'Delete “At most 6 periods on any day”',
    });
    await deleteButton.click();
    const question = page.getByRole('alertdialog');
    await expect(question.getByRole('heading')).toHaveText(
      'Delete “At most 6 periods on any day”?',
    );
    await question.getByRole('button', { name: 'Keep it' }).click();
    await expect(question).toBeHidden();
    await expect(deleteButton).toBeFocused();
    await expect(sentences(page)).toHaveCount(3);
    await deleteButton.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete condition' }).click();
    await expect(sentences(page)).toHaveText([
      'At most 4 periods of Toán a day',
      'At most 2 periods of Tin học a day',
    ]);
    await expect(addButton(page)).toBeFocused();

    const saved = await savedConditions((list) => list.length === 2);
    expect(saved).toEqual([
      { id: 'b', on: true, type: 'subjectLimit', subjectId: 'toan', max: 4, per: 'day' },
      { id: 'c', on: true, type: 'subjectLimit', subjectId: 'tin', max: 2, per: 'day' },
    ]);
  });
});

test('editing unavailable times reopens on morning, afternoon, or the chosen blocks (TC-1)', async () => {
  seed([
    { id: 'a', on: true, type: 'unavailable', blocks: [3, 4], days: [4] },
    { id: 'b', on: true, type: 'unavailable', blocks: [1, 3], days: [0, 2] },
  ]);
  await withApp(async (page) => {
    await openTeacher(page);
    await expect(sentences(page)).toHaveText([
      "Can't teach in the afternoon on Friday",
      "Can't teach in periods 3–4 or 7–8 on Monday or Wednesday",
    ]);
    await panel(page)
      .getByRole('button', { name: /^Edit “Can't teach in the afternoon/ })
      .click();
    let dialog = form(page);
    await expect(dialog.getByRole('radio', { name: 'Afternoon' })).toBeChecked();
    await expect(chip(dialog, 'Days', 'Fri')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(dialog, 'Days', 'Mon')).toHaveAttribute('aria-pressed', 'false');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await panel(page)
      .getByRole('button', { name: /^Edit “Can't teach in periods/ })
      .click();
    dialog = form(page);
    await expect(dialog.getByRole('radio', { name: 'Chosen blocks' })).toBeChecked();
    await expect(chip(dialog, 'Blocks', '3-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(dialog, 'Blocks', '7-8')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(dialog, 'Blocks', '1-2')).toHaveAttribute('aria-pressed', 'false');
    // Trying Morning and going back to Chosen blocks brings the picks back.
    await dialog.getByRole('radio', { name: 'Morning' }).click();
    await expect(dialog.locator('.condition-preview')).toContainText(
      "Can't teach in the morning on Monday or Wednesday",
    );
    await dialog.getByRole('radio', { name: 'Chosen blocks' }).click();
    await expect(chip(dialog, 'Blocks', '3-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(dialog, 'Blocks', '7-8')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(dialog, 'Blocks', '5-6')).toHaveAttribute('aria-pressed', 'false');
    // Switching the type to days off starts its days afresh.
    await dialog.getByLabel('Condition').selectOption('daysOff');
    await expect(chip(dialog, 'Days', 'Mon')).toHaveAttribute('aria-pressed', 'false');
    await chip(dialog, 'Days', 'Thu').click();
    await submit(dialog).click();
    await expect(sentences(page).nth(1)).toHaveText('Not on Thursday');
    const saved = await savedConditions((list) => list[1]!.type === 'daysOff');
    expect(saved[1]).toEqual({ id: 'b', on: true, type: 'daysOff', days: [3] });
  });
});

test("a subject limit lists only the teacher's subjects, and keeps an edited one he no longer teaches (TC-1)", async () => {
  // No cards: nothing to pick, and the form says why.
  seed([], false);
  await withApp(async (page) => {
    await openTeacher(page);
    await addButton(page).click();
    const dialog = form(page);
    await expect(dialog.getByLabel('Subject').locator('option')).toHaveText(['Choose a subject']);
    // The note is shown, and read with the field.
    const note =
      "Thầy Phúc has no cards yet, so there's no subject to pick. Add a card with them first.";
    await expect(dialog.getByText(note)).toBeVisible();
    await expect(dialog.getByLabel('Subject')).toHaveAccessibleDescription(note);
  });

  // A limit on Ngữ văn, which he has no card of, still shows its subject when edited.
  seed([{ id: 'c1', on: true, type: 'subjectLimit', subjectId: 'van', max: 2, per: 'day' }]);
  await withApp(async (page) => {
    await openTeacher(page);
    await panel(page).getByRole('button', { name: /^Edit/ }).click();
    const dialog = form(page);
    const subject = dialog.getByLabel('Subject');
    const withVan = ['Choose a subject', 'Toán', 'Ngữ văn', 'Tin học'];
    await expect(subject).toHaveValue('van');
    await expect(subject.locator('option')).toHaveText(withVan);
    // Switched to another type and back, the list is the same and Ngữ văn is still in it.
    await dialog.getByLabel('Condition').selectOption({ label: 'Most periods per day' });
    await dialog.getByLabel('Condition').selectOption({ label: 'Subject limit' });
    await expect(subject.locator('option')).toHaveText(withVan);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Adding a new one, switching type away and back keeps the list to his subjects.
    await addButton(page).click();
    await dialog.getByLabel('Condition').selectOption({ label: 'Days off' });
    await dialog.getByLabel('Condition').selectOption({ label: 'Subject limit' });
    await expect(subject.locator('option')).toHaveText(['Choose a subject', 'Toán', 'Tin học']);
  });
});
