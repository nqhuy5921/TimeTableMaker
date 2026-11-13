import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import { createAppState } from '../../src/domain/appState';
import { addCard } from '../../src/domain/cards';
import { addClass as addClassCommand } from '../../src/domain/classes';
import { addSubject } from '../../src/domain/lists';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// Subject cards and the card form (DM-5, TB-3). Cards are one pool for the whole school.
// Made-up names only.

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

const panel = (page: Page) => page.getByRole('complementary', { name: 'Subjects and issues' });
const cardButton = (page: Page, subject: string) =>
  panel(page)
    .getByRole('listitem')
    .getByRole('button', { name: new RegExp(`^${subject}`) });

test('adds, edits, and deletes cards, adding a subject, teacher, and room on the spot', async () => {
  // A timetable with grades 6 to 9 and no classes; a new one has no grades (DM-8).
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  await withApp(async (page) => {
    // An empty pool says so, with or without classes.
    await expect(panel(page).getByText('No subjects yet')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Add subject' })).toBeVisible();
    await page.getByRole('button', { name: 'New class' }).click();
    const classDialog = page.getByRole('dialog', { name: 'New class' });
    await classDialog.getByLabel('Class name').fill('6A1');
    await classDialog.getByRole('button', { name: 'Add class' }).click();
    await expect(panel(page).getByText('No subjects yet')).toBeVisible();

    // Toán, with a new teacher and room.
    await panel(page).getByRole('button', { name: 'Add subject' }).click();
    const form = page.getByRole('dialog', { name: 'Add card' });
    await expect(form.getByLabel('Subject', { exact: true })).toBeFocused();
    await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'New subject…' });
    const newSubject = form.getByRole('group', { name: 'New subject' });
    await expect(newSubject.getByLabel('Subject name')).toBeFocused();
    await newSubject.getByLabel('Subject name').fill('Toán');
    await newSubject.getByRole('button', { name: 'Add subject' }).click();
    await expect(form.getByLabel('Subject', { exact: true }).locator('option:checked')).toHaveText(
      'Toán',
    );
    // Cards have no periods per week (dropped 2026-10-19).
    await expect(form.getByLabel('Periods per week')).toHaveCount(0);

    // Enter on the small form's Cancel cancels, it doesn't add.
    await form.getByLabel('Teacher').selectOption({ label: 'New teacher…' });
    await form.getByLabel('Short name').fill('Thầy Sai');
    await form.getByRole('button', { name: 'Cancel new teacher' }).focus();
    await page.keyboard.press('Enter');
    await expect(form.getByRole('group', { name: 'New teacher' })).toHaveCount(0);
    await expect(form.getByRole('option', { name: 'Thầy Sai' })).toHaveCount(0);

    await form.getByLabel('Teacher').selectOption({ label: 'New teacher…' });
    await form.getByLabel('Short name').fill('Cô Mai');
    await form.getByLabel('Short name').press('Enter');
    await expect(form.getByRole('group', { name: 'New teacher' })).toHaveCount(0);
    await form.getByLabel('Room', { exact: true }).selectOption({ label: 'New room…' });
    await form.getByLabel('Room name').fill('P201');
    await form
      .getByRole('group', { name: 'New room' })
      .getByRole('button', { name: 'Add room' })
      .click();
    await form.getByRole('button', { name: 'Add card' }).click();
    await expect(form).toHaveCount(0);
    await expect(cardButton(page, 'Toán')).toHaveText('ToánCô Mai · P201');
    // In Toán's palette (DM-5).
    await expect(cardButton(page, 'Toán')).toHaveClass(/\bsubject-math\b/);

    // SH lớp, with no teacher or room. A second Toán with Cô Mai in P201 is refused.
    await panel(page).getByRole('button', { name: 'Add subject' }).click();
    await form.getByRole('button', { name: 'Add card' }).click();
    await expect(form.getByRole('alert')).toHaveText('Choose a subject.');
    await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'Toán' });
    await form.getByLabel('Teacher').selectOption({ label: 'Cô Mai' });
    await form.getByLabel('Room', { exact: true }).selectOption({ label: 'P201' });
    await form.getByRole('button', { name: 'Add card' }).click();
    await expect(form.getByRole('alert')).toHaveText(
      "There's already a card for Toán with Cô Mai in P201.",
    );
    await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'New subject…' });
    await form.getByLabel('Subject name').fill('SH lớp');
    await form.getByLabel('Subject name').press('Enter');
    await form.getByLabel('Teacher').selectOption({ label: 'No teacher' });
    await form.getByLabel('Room', { exact: true }).selectOption({ label: 'No room' });
    await form.getByRole('button', { name: 'Add card' }).click();
    await expect(cardButton(page, 'SH lớp')).toHaveText('SH lớpNo teacher');

    // Cancel drops a subject added in the form.
    await panel(page).getByRole('button', { name: 'Add subject' }).click();
    await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'New subject…' });
    await form.getByLabel('Subject name').fill('Tin học');
    await form.getByLabel('Subject name').press('Enter');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(form).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Add subject' }).click();
    await expect(form.getByRole('option', { name: 'Tin học' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Edit Toán: no room.
    await cardButton(page, 'Toán').click();
    const edit = page.getByRole('dialog', { name: 'Edit Toán · Cô Mai · P201' });
    await expect(edit.getByLabel('Teacher').locator('option:checked')).toHaveText('Cô Mai');
    await edit.getByLabel('Room', { exact: true }).selectOption({ label: 'No room' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(cardButton(page, 'Toán')).toHaveText('ToánCô Mai');

    // Delete SH lớp. It isn't on the grid, so nothing is asked, and a room added in the
    // form before deleting isn't kept.
    await cardButton(page, 'SH lớp').click();
    const editHomeroom = page.getByRole('dialog', { name: 'Edit SH lớp' });
    await editHomeroom.getByLabel('Room', { exact: true }).selectOption({ label: 'New room…' });
    await editHomeroom.getByLabel('Room name').fill('P999');
    await editHomeroom.getByLabel('Room name').press('Enter');
    await page.getByRole('button', { name: 'Delete card' }).click();
    await expect(cardButton(page, 'SH lớp')).toHaveCount(0);
  });

  // Everything survives a restart (TB-7).
  await withApp(async (page) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    await expect(cardButton(page, 'Toán')).toHaveText('ToánCô Mai');
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);
    await cardButton(page, 'Toán').click();
    await expect(page.getByLabel('Room', { exact: true }).locator('option:checked')).toHaveText(
      'No room',
    );
  });
  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(saved.subjects.map((s: { name: string }) => s.name)).toEqual(['Toán', 'SH lớp']);
  expect(saved.teachers.map((t: { shortName: string }) => t.shortName)).toEqual(['Cô Mai']);
  expect(saved.rooms.map((r: { name: string }) => r.name)).toEqual(['P201']);
  expect(saved.cards).toHaveLength(1);
  expect(saved.cards[0]).not.toHaveProperty('periodsPerWeek');
  expect(saved.cards[0]).not.toHaveProperty('classId');
  expect(saved.subjects[0]).not.toHaveProperty('defaultPeriods');
});

test('deleting a card that is on the grid asks first and removes its placements', async () => {
  const withClass = addClassCommand(createAppState(emptySchool()), '8CE2', () => 'c1');
  if (!withClass.ok) throw new Error(withClass.error);
  const withSubject = addSubject(withClass.state.file, 'Ngữ văn');
  if (!withSubject.ok) throw new Error(withSubject.error);
  const fields = { subjectId: withSubject.id, teacherId: null, roomId: null };
  const withCard = addCard(withSubject.file, fields, () => 'card1');
  if (!withCard.ok) throw new Error(withCard.error);
  writeFileSync(
    join(userData, 'timetable.json'),
    serializeTimetableFile({
      ...withCard.file,
      placements: [
        { id: 'p1', cardId: 'card1', classId: 'c1', day: 0, block: 0, part: 'full' },
        { id: 'p2', cardId: 'card1', classId: 'c1', day: 3, block: 2, part: 'full' },
      ],
    }),
  );

  await withApp(async (page) => {
    await expect(page.getByTestId('placed-count')).toHaveText('4/50');
    await cardButton(page, 'Ngữ văn').click();
    await page.getByRole('button', { name: 'Delete card' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete Ngữ văn?' });
    await expect(confirm).toContainText("It's on 8CE2's grid twice.");

    await confirm.getByRole('button', { name: 'Keep the card' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Ngữ văn' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete card' }).click();
    await confirm.getByRole('button', { name: 'Delete card' }).click();
    await expect(cardButton(page, 'Ngữ văn')).toHaveCount(0);
    await expect(page.getByTestId('placed-count')).toHaveText('0/50');
  });

  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(saved.cards).toEqual([]);
  expect(saved.placements).toEqual([]);
});
